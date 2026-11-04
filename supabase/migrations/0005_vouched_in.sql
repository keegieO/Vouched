-- 0005: "Put your name on it"
--   • Invite-only joining: every member is vouched in by someone (invites, profiles.invited_by)
--   • Scarce vouches: 3 a month per member, counted in a ledger that deletes can't reset
--   • Track record: members removed for verified scams/fake accounts count against the people who backed them
--   • Trust paths: the shortest chain of vouches / vouch-ins between two people
--   • Props: a daily anonymous game ("Who would you call at 2am?")

-- ─────────────────────────────────────────────────────────────
-- Tunable settings (readable by everyone, changed only by admins)
-- ─────────────────────────────────────────────────────────────
create table public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
create policy "Settings are public" on public.app_config for select using (true);
insert into public.app_config (key, value) values
  ('invite_only', 'on'),          -- set to 'off' while you seed founding members, then back to 'on'
  ('monthly_vouches', '3'),
  ('invites_per_member', '3'),
  ('daily_props', '25');

create or replace function public.config_int(k text, fallback int) returns int
language sql stable set search_path = public as $$
  select coalesce((select value::int from app_config where key = k), fallback)
$$;

-- ─────────────────────────────────────────────────────────────
-- Profiles: who vouched you in, standing, earned invites
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column invited_by    uuid references public.profiles(id) on delete set null,
  add column standing      text not null default 'good' check (standing in ('good','removed')),
  add column removed_at    timestamptz,
  add column extra_invites int  not null default 0 check (extra_invites between 0 and 50);
create index profiles_invited_by on public.profiles (invited_by);
-- New "ink" squiggle cover, now the default.
alter table public.profiles drop constraint if exists profiles_cover_check;
alter table public.profiles add constraint profiles_cover_check check (cover in ('ink','solid','dots','grid','stripes','rings'));
alter table public.profiles alter column cover set default 'ink';

-- ─────────────────────────────────────────────────────────────
-- Invites
-- ─────────────────────────────────────────────────────────────
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  inviter_id   uuid not null references public.profiles(id) on delete cascade,
  invitee_name text not null check (char_length(btrim(invitee_name)) between 1 and 50),
  contact      text check (char_length(contact) <= 80),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  claimed_by   uuid unique references auth.users(id) on delete set null,
  claimed_at   timestamptz
);
create index invites_inviter on public.invites (inviter_id, created_at desc);
alter table public.invites enable row level security;
create policy "See invites you sent or claimed" on public.invites for select using (auth.uid() in (inviter_id, claimed_by));
create policy "Invite as yourself"              on public.invites for insert with check (inviter_id = auth.uid());
create policy "Cancel an unclaimed invite"      on public.invites for delete using (inviter_id = auth.uid() and claimed_by is null);

-- Invites that still use up a slot: claimed ones, and unclaimed ones that haven't expired.
create or replace function public.invites_used(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from invites
   where inviter_id = p_user and (claimed_by is not null or expires_at > now())
$$;

create or replace function public.invites_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, config_int('invites_per_member', 3) + p.extra_invites - invites_used(p.id))
    from profiles p where p.id = auth.uid() and p.standing = 'good'
$$;

create or replace function public.before_invite_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where id = new.inviter_id;
  if not found or me.standing <> 'good' then
    raise exception 'Only members in good standing can vouch people in' using errcode = '42501';
  end if;
  if invites_used(new.inviter_id) >= config_int('invites_per_member', 3) + me.extra_invites then
    raise exception 'You''re out of invites. You earn more as the people you vouched in stay in good standing.' using errcode = '42501';
  end if;
  new.invitee_name := btrim(new.invitee_name);
  new.claimed_by := null;
  new.claimed_at := null;
  new.created_at := now();
  new.expires_at := now() + interval '30 days';
  new.code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  return new;
end $$;
create trigger invites_before_insert before insert on public.invites
  for each row execute function public.before_invite_insert();

-- Public preview for the /join/CODE page (works signed out).
create or replace function public.invite_preview(p_code text)
returns table (valid boolean, invitee_name text, inviter_username text, inviter_name text, inviter_avatar text)
language sql stable security definer set search_path = public as $$
  select i.claimed_by is null and i.expires_at > now() and p.standing = 'good',
         i.invitee_name, p.username::text, p.display_name, p.avatar_url
    from invites i join profiles p on p.id = i.inviter_id
   where i.code = upper(btrim(p_code))
$$;

-- Called right after sign-up, before the profile is created.
create or replace function public.claim_invite(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare inv invites; inviter profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'You''re already a member' using errcode = '42501';
  end if;
  select * into inv from invites where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'That invite code doesn''t exist' using errcode = 'P0002'; end if;
  if inv.claimed_by = auth.uid() then
    return (select username::text from profiles where id = inv.inviter_id);
  end if;
  if inv.claimed_by is not null or inv.expires_at <= now() then
    raise exception 'That invite was already used or has expired' using errcode = '42501';
  end if;
  select * into inviter from profiles where id = inv.inviter_id;
  if inviter.standing <> 'good' then raise exception 'That invite is no longer valid' using errcode = '42501'; end if;
  -- One invite per person: release any other invite this account claimed but never used.
  update invites set claimed_by = null, claimed_at = null where claimed_by = auth.uid();
  update invites set claimed_by = auth.uid(), claimed_at = now() where id = inv.id;
  return inviter.username::text;
end $$;

-- Profile creation is gated on a claimed invite (unless invite_only is off).
-- Members can never set invited_by, standing or extra_invites themselves.
-- Runs as the caller (not security definer) so current_user tells members apart from admins.
create or replace function public.profile_membership() returns trigger
language plpgsql set search_path = public as $$
declare inv invites;
begin
  if current_user::text not in ('anon', 'authenticated') then
    if new.standing = 'removed' and (tg_op = 'INSERT' or old.standing <> 'removed') then
      new.removed_at := now(); new.discoverable := false; new.who_can_vouch := 'nobody'; new.open_to_vouches := false;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.standing := 'good'; new.removed_at := null; new.extra_invites := 0; new.invited_by := null;
    select * into inv from invites where claimed_by = new.id;
    if found then
      new.invited_by := inv.inviter_id;
    elsif coalesce((select value from app_config where key = 'invite_only'), 'on') = 'on' then
      raise exception 'Vouched is invite-only. Ask someone on Vouched to vouch you in.' using errcode = '42501';
    end if;
  else
    new.invited_by := old.invited_by; new.standing := old.standing;
    new.removed_at := old.removed_at; new.extra_invites := old.extra_invites;
    if old.standing = 'removed' then
      new.discoverable := false; new.who_can_vouch := 'nobody'; new.open_to_vouches := false;
    end if;
  end if;
  return new;
end $$;
create trigger profiles_membership before insert or update on public.profiles
  for each row execute function public.profile_membership();

-- When someone joins: tell the person who vouched them in, and follow each other.
create or replace function public.after_profile_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invited_by is not null then
    insert into notifications (user_id, type, actor_id) values (new.invited_by, 'invite_joined', new.id);
    insert into follows (follower_id, followee_id) values (new.id, new.invited_by), (new.invited_by, new.id)
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger profiles_after_insert after insert on public.profiles
  for each row execute function public.after_profile_insert();

-- ─────────────────────────────────────────────────────────────
-- Notifications: props (always anonymous) and invite joins
-- ─────────────────────────────────────────────────────────────
alter table public.notifications add column prompt_id smallint;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_vouch','vouch_approved','new_follower','cosign','vouch_reply','rec_answer','rec_for_you',
                  'vouch_request','props','invite_joined'));
alter table public.user_settings add column notify_props boolean not null default true;

-- ─────────────────────────────────────────────────────────────
-- Scarce vouches: a ledger counts every vouch written this month.
-- Deleting a vouch or having it hidden doesn't give the slot back.
-- ─────────────────────────────────────────────────────────────
create table public.vouch_ledger (
  author_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null,
  created_at timestamptz not null default now()
);
create index vouch_ledger_author on public.vouch_ledger (author_id, created_at desc);
alter table public.vouch_ledger enable row level security;   -- no policies: only definer functions touch it

create or replace function public.vouches_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, config_int('monthly_vouches', 3) - (
           select count(*)::int from vouch_ledger
            where author_id = auth.uid() and created_at >= date_trunc('month', now())))
   where exists (select 1 from profiles where id = auth.uid() and standing = 'good')
$$;

create or replace function public.before_vouch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare used int; who text; s_standing text; a_standing text;
begin
  new.status := 'pending';
  new.approved_at := null;
  select who_can_vouch, standing into who, s_standing from profiles where id = new.subject_id;
  select standing into a_standing from profiles where id = new.author_id;
  if a_standing is distinct from 'good' then
    raise exception 'Your account can''t vouch right now' using errcode = '42501';
  end if;
  if s_standing is distinct from 'good' or who is null or who = 'nobody' then
    raise exception 'This person is not taking vouches right now' using errcode = '42501';
  end if;
  if who = 'following' and not exists (select 1 from follows where follower_id = new.subject_id and followee_id = new.author_id) then
    raise exception 'This person only takes vouches from people they follow' using errcode = '42501';
  end if;
  if is_blocked(new.subject_id, new.author_id) or is_blocked(new.author_id, new.subject_id) then
    raise exception 'You can''t vouch for this person' using errcode = '42501';
  end if;
  select count(*) into used from vouch_ledger
   where author_id = new.author_id and created_at >= date_trunc('month', now());
  if used >= config_int('monthly_vouches', 3) then
    raise exception 'You''ve used your % vouches for this month. They reset on the 1st. Give props instead.',
      config_int('monthly_vouches', 3) using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.after_vouch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into vouch_ledger (author_id, subject_id) values (new.author_id, new.subject_id);
  if coalesce((select notify_vouches from user_settings where user_id = new.subject_id), true) then
    insert into notifications (user_id, type, vouch_id, actor_id) values (new.subject_id, 'new_vouch', new.id, new.author_id);
  end if;
  update vouch_requests set done = true where requester_id = new.subject_id and recipient_id = new.author_id and not done;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Track record: everyone you backed (approved vouches + people you vouched in)
-- weight drops when people you backed are removed for scams / fake accounts.
-- ─────────────────────────────────────────────────────────────
create or replace function public.track_record(p_user uuid)
returns table (backed int, removed int, weight numeric)
language sql stable security definer set search_path = public as $$
  with b as (
    select subject_id as id from vouches where author_id = p_user and status = 'approved'
    union
    select id from profiles where invited_by = p_user
  )
  select count(*)::int,
         (count(*) filter (where p.standing = 'removed'))::int,
         case when count(*) = 0 then 1.00
              else round(greatest(0.25, 1 - 2.0 * (count(*) filter (where p.standing = 'removed')) / count(*)), 2) end
    from b join profiles p on p.id = b.id
$$;

-- ─────────────────────────────────────────────────────────────
-- Trust graph. Edges: approved vouches (either direction) and vouch-ins.
-- Removed members and blocks break the chain. Depth is capped at 3 steps.
-- (Fine for launch-scale data; move to a graph cache past ~100k members.)
-- ─────────────────────────────────────────────────────────────
create or replace function public.trust_edges()
returns table (a uuid, b uuid, label text)
language sql stable security definer set search_path = public as $$
  select v.author_id, v.subject_id, v.relationship from vouches v where v.status = 'approved'
  union
  select v.subject_id, v.author_id, v.relationship from vouches v where v.status = 'approved'
  union
  select p.invited_by, p.id, 'Vouched in' from profiles p where p.invited_by is not null
  union
  select p.id, p.invited_by, 'Vouched in' from profiles p where p.invited_by is not null
$$;
revoke all on function public.trust_edges() from public, anon, authenticated;

create or replace function public.trust_path(p_to uuid, max_steps int default 3)
returns table (pos int, id uuid, username text, display_name text, avatar_url text, via text)
language sql stable security definer set search_path = public as $$
  with recursive me as (select auth.uid() as id),
  e as (
    select t.a, t.b, t.label from trust_edges() t
      join profiles pa on pa.id = t.a and pa.standing = 'good'
      join profiles pb on pb.id = t.b and pb.standing = 'good'
     where not is_blocked((select id from me), t.b) and not is_blocked(t.b, (select id from me))
  ),
  walk as (
    select (select id from me) as node, array[(select id from me)] as path, array[]::text[] as labels
     where (select id from me) is not null and (select id from me) <> p_to
    union all
    select e.b, w.path || e.b, w.labels || e.label
      from walk w join e on e.a = w.node
     where cardinality(w.path) <= least(greatest(max_steps, 1), 3)
       and w.node <> p_to and not e.b = any(w.path)
  ),
  best as (select path, labels from walk where node = p_to order by cardinality(path) limit 1)
  select i::int, p.id, p.username::text, p.display_name, p.avatar_url,
         case when i > 1 then best.labels[i - 1] end
    from best cross join lateral generate_subscripts(best.path, 1) as i
    join profiles p on p.id = best.path[i]
   order by i
$$;
revoke all on function public.trust_path(uuid, int) from public, anon; grant execute on function public.trust_path(uuid, int) to authenticated;

-- Everyone within N steps of the signed-in member (for "In my circles" and step chips).
create or replace function public.my_circle(max_steps int default 2)
returns table (id uuid, steps int)
language sql stable security definer set search_path = public as $$
  with recursive me as (select auth.uid() as id),
  e as (
    select t.a, t.b from trust_edges() t
      join profiles pa on pa.id = t.a and pa.standing = 'good'
      join profiles pb on pb.id = t.b and pb.standing = 'good'
     where not is_blocked((select id from me), t.b) and not is_blocked(t.b, (select id from me))
  ),
  walk as (
    select (select id from me) as node, 0 as depth, array[(select id from me)] as path
     where (select id from me) is not null
    union all
    select e.b, w.depth + 1, w.path || e.b
      from walk w join e on e.a = w.node
     where w.depth < least(greatest(max_steps, 1), 3) and not e.b = any(w.path)
  )
  select node, min(depth)::int from walk where node <> (select id from me) group by node
$$;
revoke all on function public.my_circle(int) from public, anon; grant execute on function public.my_circle(int) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Props: daily anonymous picks
-- ─────────────────────────────────────────────────────────────
create table public.prompts (
  id       smallint primary key,
  question text not null,
  label    text not null,
  icon     text not null,
  active   boolean not null default true
);
alter table public.prompts enable row level security;
create policy "Prompts are public" on public.prompts for select using (true);
insert into public.prompts (id, question, label, icon) values
  (1,  'Who would you call at 2am if your car broke down?', '2am call',              'moon'),
  (2,  'Who always pays you back?',                         'Pays you back',         'gift'),
  (3,  'Who would you trust with your house keys?',         'Trust with keys',       'lock'),
  (4,  'Who is the hardest worker you know?',               'Hardest worker',        'tool'),
  (5,  'Who gives the most honest advice?',                 'Honest advice',         'msg'),
  (6,  'Who makes any job more fun?',                       'Makes it fun',          'sparkle'),
  (7,  'Who would you hire tomorrow, no interview?',        'Hire on sight',         'brief'),
  (8,  'Who stays calm when everything goes wrong?',        'Calm in chaos',         'shield'),
  (9,  'Who shows up early, every time?',                   'Always early',          'clock'),
  (10, 'Who do kids and dogs love the most?',               'Kids & dogs love them', 'paw');

create table public.props (
  id          uuid primary key default gen_random_uuid(),
  giver_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  prompt_id   smallint not null references public.prompts(id),
  created_at  timestamptz not null default now(),
  check (giver_id <> receiver_id)
);
create index props_receiver on public.props (receiver_id, prompt_id);
create index props_giver on public.props (giver_id, created_at desc);
alter table public.props enable row level security;
-- Receivers never read this table directly, so they can never see who picked them.
create policy "See props you gave" on public.props for select using (giver_id = auth.uid());
create policy "Give props as yourself" on public.props for insert with check (giver_id = auth.uid());

create or replace function public.before_props_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare today int;
begin
  new.created_at := now();
  if (select standing from profiles where id = new.giver_id) is distinct from 'good'
     or (select standing from profiles where id = new.receiver_id) is distinct from 'good' then
    raise exception 'You can''t give props to this person' using errcode = '42501';
  end if;
  if is_blocked(new.receiver_id, new.giver_id) or is_blocked(new.giver_id, new.receiver_id) then
    raise exception 'You can''t give props to this person' using errcode = '42501';
  end if;
  if not exists (select 1 from prompts where id = new.prompt_id and active) then
    raise exception 'That question is no longer active' using errcode = '22023';
  end if;
  select count(*) into today from props where giver_id = new.giver_id and created_at > now() - interval '24 hours';
  if today >= config_int('daily_props', 25) then
    raise exception 'That''s all the props for today. New questions tomorrow.' using errcode = '42501';
  end if;
  if exists (select 1 from props where giver_id = new.giver_id and receiver_id = new.receiver_id
               and prompt_id = new.prompt_id and created_at > now() - interval '7 days') then
    raise exception 'You already picked them for this one this week' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger props_before_insert before insert on public.props
  for each row execute function public.before_props_insert();

create or replace function public.after_props_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select notify_props from user_settings where user_id = new.receiver_id), true) then
    -- actor_id stays null: props are anonymous.
    insert into notifications (user_id, type, prompt_id) values (new.receiver_id, 'props', new.prompt_id);
  end if;
  return new;
end $$;
create trigger props_after_insert after insert on public.props
  for each row execute function public.after_props_insert();

-- Counts shown on a profile (no giver info).
create or replace function public.props_summary(p_user uuid)
returns table (prompt_id smallint, label text, icon text, n bigint)
language sql stable security definer set search_path = public as $$
  select q.id, q.label, q.icon, count(*)
    from props x join prompts q on q.id = x.prompt_id
    join profiles p on p.id = x.receiver_id and p.standing = 'good'
   where x.receiver_id = p_user
   group by q.id, q.label, q.icon
   order by count(*) desc, q.id
$$;

-- Props you received, newest first, without who gave them.
create or replace function public.my_props(lim int default 50)
returns table (id uuid, prompt_id smallint, question text, label text, icon text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, q.id, q.question, q.label, q.icon, x.created_at
    from props x join prompts q on q.id = x.prompt_id
   where x.receiver_id = auth.uid()
   order by x.created_at desc
   limit least(greatest(lim, 1), 200)
$$;
revoke all on function public.my_props(int) from public, anon; grant execute on function public.my_props(int) to authenticated;

create or replace function public.props_given_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from props where giver_id = auth.uid() and created_at > date_trunc('day', now())
$$;

-- Four people to pick from: your circle first, then anyone in good standing.
create or replace function public.prop_options(n int default 4, exclude uuid[] default '{}')
returns table (id uuid, username text, display_name text, headline text, avatar_url text)
language sql volatile security definer set search_path = public as $$
  with c as (select id, 0 as tier from my_circle(2)
             union select followee_id, 0 from follows where follower_id = auth.uid())
  select p.id, p.username::text, p.display_name, p.headline, p.avatar_url
    from profiles p
    left join (select id, min(tier) as tier from c group by id) c on c.id = p.id
   where auth.uid() is not null and p.id <> auth.uid() and p.standing = 'good'
     and not p.id = any(coalesce(exclude, '{}'))
     and not is_blocked(auth.uid(), p.id) and not is_blocked(p.id, auth.uid())
     and (c.id is not null or p.discoverable)
   order by coalesce(c.tier, 1), random()
   limit least(greatest(n, 2), 8)
$$;
revoke all on function public.prop_options(int, uuid[]) from public, anon; grant execute on function public.prop_options(int, uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Discover: hide removed members
-- ─────────────────────────────────────────────────────────────
create or replace function public.search_profiles(q text default '', near text default null, lim int default 30, status_filter text default null)
returns table (
  id uuid, username text, display_name text, headline text, city text, avatar_url text,
  theme text, style text, status text, skills text[], phone_verified boolean, vouches bigint, circles bigint, followers bigint
)
language sql stable set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.headline,
         case when p.show_city then p.city end, p.avatar_url, p.theme, p.style, p.status, p.skills, p.phone_verified,
         coalesce(s.vouches, 0), coalesce(s.circles, 0),
         case when p.show_counts then (select count(*) from follows f where f.followee_id = p.id) else 0 end
    from profiles p
    left join (
      select subject_id, count(*) as vouches, count(distinct relationship) as circles
        from vouches where status = 'approved' group by subject_id
    ) s on s.subject_id = p.id
   where p.discoverable and p.standing = 'good'
     and (coalesce(q, '') = ''
          or p.display_name ilike '%' || q || '%'
          or p.username::text ilike '%' || q || '%'
          or p.headline ilike '%' || q || '%'
          or p.bio ilike '%' || q || '%'
          or exists (select 1 from unnest(p.skills) k where k ilike '%' || q || '%')
          or (p.show_city and p.city ilike '%' || q || '%'))
     and (near is null or (p.show_city and p.city ilike near))
     and (status_filter is null or p.status = status_filter)
   order by coalesce(s.vouches, 0) desc, p.created_at desc
   limit least(greatest(lim, 1), 50)
$$;

revoke all on function public.claim_invite(text) from public, anon; grant execute on function public.claim_invite(text) to authenticated;
revoke all on function public.invites_left() from public, anon; grant execute on function public.invites_left() to authenticated;
revoke all on function public.vouches_left() from public, anon; grant execute on function public.vouches_left() to authenticated;
revoke all on function public.props_given_today() from public, anon; grant execute on function public.props_given_today() to authenticated;

insert into public.reserved_usernames (username) values ('join'),('invite'),('invites'),('props'),('how')
on conflict do nothing;
