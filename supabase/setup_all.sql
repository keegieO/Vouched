-- Vouched: full database setup in one paste.
-- Supabase → SQL Editor → New query → paste all of this → Run.
-- (Same as running supabase/migrations/0001 … 0007 in order.)
-- Already ran an older setup_all.sql? Run only upgrade_0007.sql instead.


-- ═════════ 0001_init.sql ═════════

-- Vouched: initial schema
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists citext;

-- ─────────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        citext not null unique
                  check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name    text not null check (char_length(display_name) between 1 and 50),
  city            text check (char_length(city) <= 60),
  headline        text check (char_length(headline) <= 80),
  avatar_url      text,
  theme           text not null default 'cobalt'
                  check (theme in ('cobalt','forest','plum','ember','slate')),
  show_city       boolean not null default true,
  open_to_vouches boolean not null default true,
  phone_verified  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.reserved_usernames (username citext primary key);
insert into public.reserved_usernames (username) values
  ('admin'),('api'),('app'),('ask'),('auth'),('help'),('home'),('inbox'),('login'),
  ('logout'),('onboarding'),('privacy'),('settings'),('signup'),('support'),('terms'),
  ('vouch'),('vouched'),('www'),('about'),('blog'),('static'),('_next');

create or replace function public.check_username() returns trigger
language plpgsql as $$
begin
  new.username := lower(new.username::text);
  if exists (select 1 from public.reserved_usernames r where r.username = new.username) then
    raise exception 'That username is reserved' using errcode = '23514';
  end if;
  -- phone_verified is only changed by the Auth sync below, never by the user.
  if tg_op = 'UPDATE' and new.phone_verified is distinct from old.phone_verified
     and coalesce(current_setting('vouched.phone_sync', true), '') <> 'on' then
    new.phone_verified := old.phone_verified;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_check_username
  before insert or update on public.profiles
  for each row execute function public.check_username();

-- Keep phone_verified in sync with Supabase Auth
create or replace function public.sync_phone_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('vouched.phone_sync', 'on', true);
  update public.profiles
     set phone_verified = (new.phone_confirmed_at is not null)
   where id = new.id;
  perform set_config('vouched.phone_sync', 'off', true);
  return new;
end $$;

create trigger on_auth_user_phone_change
  after insert or update of phone_confirmed_at on auth.users
  for each row execute function public.sync_phone_verified();

create or replace function public.init_phone_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select (u.phone_confirmed_at is not null) into new.phone_verified
    from auth.users u where u.id = new.id;
  new.phone_verified := coalesce(new.phone_verified, false);
  return new;
end $$;

create trigger profiles_init_phone_verified
  before insert on public.profiles
  for each row execute function public.init_phone_verified();

-- ─────────────────────────────────────────────────────────────
-- Vouches
-- ─────────────────────────────────────────────────────────────
create table public.vouches (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.profiles(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  relationship  text not null
                check (relationship in ('Client','Coworker','Friend','Roommate','Neighbor','Family','Classmate','Teammate')),
  duration      text not null check (char_length(duration) <= 40),
  traits        text[] not null default '{}' check (cardinality(traits) <= 3),
  body          text not null check (char_length(body) between 20 and 280),
  status        text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,
  unique (subject_id, author_id),
  check (subject_id <> author_id)
);
create index vouches_subject_status on public.vouches (subject_id, status, created_at desc);
create index vouches_author on public.vouches (author_id);

-- ─────────────────────────────────────────────────────────────
-- Blocks, reports, notifications
-- ─────────────────────────────────────────────────────────────
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  vouch_id    uuid references public.vouches(id) on delete set null,
  profile_id  uuid references public.profiles(id) on delete set null,
  reason      text not null check (reason in ('fake','harassment','private_info','spam','other')),
  details     text check (char_length(details) <= 500),
  created_at  timestamptz not null default now(),
  check (vouch_id is not null or profile_id is not null)
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('new_vouch','vouch_approved')),
  vouch_id    uuid references public.vouches(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, read, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Vouch rules: blocks, closed profiles, rate limit, notifications
-- ─────────────────────────────────────────────────────────────
create or replace function public.before_vouch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  new.status := 'pending';
  new.approved_at := null;

  if not exists (select 1 from profiles where id = new.subject_id and open_to_vouches) then
    raise exception 'This person is not taking vouches right now' using errcode = '42501';
  end if;

  if exists (select 1 from blocks where blocker_id = new.subject_id and blocked_id = new.author_id) then
    raise exception 'You can''t vouch for this person' using errcode = '42501';
  end if;

  select count(*) into recent from vouches
   where author_id = new.author_id and created_at > now() - interval '24 hours';
  if recent >= 20 then
    raise exception 'You''ve hit today''s vouch limit. Try again tomorrow.' using errcode = '42501';
  end if;

  return new;
end $$;

create trigger vouches_before_insert
  before insert on public.vouches
  for each row execute function public.before_vouch_insert();

create or replace function public.after_vouch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, vouch_id, actor_id)
  values (new.subject_id, 'new_vouch', new.id, new.author_id);
  return new;
end $$;

create trigger vouches_after_insert
  after insert on public.vouches
  for each row execute function public.after_vouch_insert();

-- Subject approves or hides a vouch
create or replace function public.set_vouch_status(p_vouch_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v vouches;
begin
  if p_status not in ('approved','hidden') then
    raise exception 'Invalid status';
  end if;
  select * into v from vouches where id = p_vouch_id and subject_id = auth.uid();
  if not found then
    raise exception 'Vouch not found' using errcode = '42501';
  end if;
  update vouches
     set status = p_status,
         approved_at = case when p_status = 'approved' then now() else null end
   where id = p_vouch_id;
  if p_status = 'approved' and v.status <> 'approved' then
    insert into notifications (user_id, type, vouch_id, actor_id)
    values (v.author_id, 'vouch_approved', v.id, v.subject_id);
  end if;
end $$;

-- Author edits their own vouch (sends it back for approval)
create or replace function public.edit_my_vouch(
  p_vouch_id uuid, p_relationship text, p_duration text, p_traits text[], p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update vouches
     set relationship = p_relationship, duration = p_duration, traits = p_traits,
         body = p_body, status = 'pending', approved_at = null
   where id = p_vouch_id and author_id = auth.uid();
  if not found then
    raise exception 'Vouch not found' using errcode = '42501';
  end if;
end $$;

-- Delete the signed-in account and everything tied to it
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from anon;
revoke all on function public.set_vouch_status(uuid, text) from anon;
revoke all on function public.edit_my_vouch(uuid, text, text, text[], text) from anon;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.vouches            enable row level security;
alter table public.blocks             enable row level security;
alter table public.reports            enable row level security;
alter table public.notifications      enable row level security;
alter table public.reserved_usernames enable row level security;

create policy "Profiles are public" on public.profiles for select using (true);
create policy "Create own profile"  on public.profiles for insert with check (id = auth.uid());
create policy "Edit own profile"    on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());


create policy "Approved vouches are public, others visible to the two people"
  on public.vouches for select
  using (status = 'approved' or auth.uid() in (subject_id, author_id));
create policy "Write vouches as yourself"
  on public.vouches for insert
  with check (author_id = auth.uid());
create policy "Either person can delete a vouch"
  on public.vouches for delete
  using (auth.uid() in (subject_id, author_id));
-- No direct UPDATE: status and edits go through the functions above.

create policy "See own blocks"   on public.blocks for select using (blocker_id = auth.uid());
create policy "Block as yourself" on public.blocks for insert with check (blocker_id = auth.uid());
create policy "Unblock as yourself" on public.blocks for delete using (blocker_id = auth.uid());

create policy "File reports as yourself" on public.reports for insert with check (reporter_id = auth.uid());

create policy "Read own notifications"   on public.notifications for select using (user_id = auth.uid());
create policy "Mark own notifications"   on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Clear own notifications"  on public.notifications for delete using (user_id = auth.uid());

create policy "Reserved names are readable" on public.reserved_usernames for select using (true);

-- ─────────────────────────────────────────────────────────────
-- Avatars (public bucket, each user writes only their own folder)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "Avatar images are public"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "Upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Replace own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Live updates for the inbox badge
alter publication supabase_realtime add table public.notifications;

-- ═════════ 0002_profile_styles.sql ═════════

-- Profile styles: how someone's public page looks (on top of their profile color).
alter table public.profiles
  add column if not exists style text not null default 'signed'
  check (style in ('signed','pop','night','badge'));

-- ═════════ 0003_social.sql ═════════

-- Vouched social layer: follows, co-signs, thank-you replies, recommendation asks, discover search.

-- ─────────────────────────────────────────────────────────────
-- Thank-you replies on vouches
-- ─────────────────────────────────────────────────────────────
alter table public.vouches
  add column if not exists reply    text check (char_length(reply) between 1 and 200),
  add column if not exists reply_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- Follows
-- ─────────────────────────────────────────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);

-- ─────────────────────────────────────────────────────────────
-- Co-signs ("I know them too, this is true")
-- ─────────────────────────────────────────────────────────────
create table public.cosigns (
  vouch_id   uuid not null references public.vouches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vouch_id, user_id)
);
create index cosigns_user on public.cosigns (user_id);

-- ─────────────────────────────────────────────────────────────
-- Recommendation asks and answers
-- ─────────────────────────────────────────────────────────────
create table public.requests (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 10 and 200),
  city       text check (char_length(city) <= 60),
  created_at timestamptz not null default now()
);
create index requests_author on public.requests (author_id, created_at desc);
create index requests_recent on public.requests (created_at desc);

create table public.request_answers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.requests(id) on delete cascade,
  author_id      uuid not null references public.profiles(id) on delete cascade,
  recommended_id uuid not null references public.profiles(id) on delete cascade,
  note           text check (char_length(note) <= 160),
  created_at     timestamptz not null default now(),
  unique (request_id, author_id, recommended_id)
);
create index request_answers_request on public.request_answers (request_id);

-- ─────────────────────────────────────────────────────────────
-- Notifications: new kinds
-- ─────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_vouch','vouch_approved','new_follower','cosign','vouch_reply','rec_answer','rec_for_you'));
alter table public.notifications add column if not exists request_id uuid references public.requests(id) on delete cascade;

-- ─────────────────────────────────────────────────────────────
-- Rules (triggers)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_blocked(p_blocker uuid, p_blocked uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where blocker_id = p_blocker and blocked_id = p_blocked)
$$;

create or replace function public.on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if is_blocked(new.followee_id, new.follower_id) then
    raise exception 'You can''t follow this person' using errcode = '42501';
  end if;
  select count(*) into recent from follows where follower_id = new.follower_id and created_at > now() - interval '24 hours';
  if recent >= 200 then
    raise exception 'You''ve hit today''s follow limit.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger follows_before_insert before insert on public.follows for each row execute function public.on_follow();

create or replace function public.after_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, actor_id) values (new.followee_id, 'new_follower', new.follower_id);
  return new;
end $$;
create trigger follows_after_insert after insert on public.follows for each row execute function public.after_follow();

-- Blocking someone also removes their follow
create or replace function public.after_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from follows where follower_id = new.blocked_id and followee_id = new.blocker_id;
  return new;
end $$;
create trigger blocks_after_insert after insert on public.blocks for each row execute function public.after_block();

create or replace function public.on_cosign() returns trigger
language plpgsql security definer set search_path = public as $$
declare v vouches;
begin
  select * into v from vouches where id = new.vouch_id;
  if not found or v.status <> 'approved' then
    raise exception 'You can only co-sign vouches that are on someone''s page' using errcode = '42501';
  end if;
  if new.user_id in (v.subject_id, v.author_id) then
    raise exception 'You can''t co-sign a vouch you wrote or received' using errcode = '42501';
  end if;
  if is_blocked(v.subject_id, new.user_id) then
    raise exception 'You can''t co-sign vouches for this person' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger cosigns_before_insert before insert on public.cosigns for each row execute function public.on_cosign();

create or replace function public.after_cosign() returns trigger
language plpgsql security definer set search_path = public as $$
declare v vouches;
begin
  select * into v from vouches where id = new.vouch_id;
  insert into notifications (user_id, type, vouch_id, actor_id) values
    (v.subject_id, 'cosign', v.id, new.user_id),
    (v.author_id,  'cosign', v.id, new.user_id);
  return new;
end $$;
create trigger cosigns_after_insert after insert on public.cosigns for each row execute function public.after_cosign();

create or replace function public.on_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  select count(*) into recent from requests where author_id = new.author_id and created_at > now() - interval '24 hours';
  if recent >= 10 then
    raise exception 'You''ve hit today''s limit for asks.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger requests_before_insert before insert on public.requests for each row execute function public.on_request();

create or replace function public.on_answer() returns trigger
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = new.request_id;
  if not found then raise exception 'That ask was deleted' using errcode = '42501'; end if;
  if new.recommended_id = r.author_id then
    raise exception 'Recommend someone other than the person asking' using errcode = '42501';
  end if;
  if is_blocked(r.author_id, new.author_id) then
    raise exception 'You can''t answer this ask' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger answers_before_insert before insert on public.request_answers for each row execute function public.on_answer();

create or replace function public.after_answer() returns trigger
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = new.request_id;
  if r.author_id <> new.author_id then
    insert into notifications (user_id, type, actor_id, request_id) values (r.author_id, 'rec_answer', new.author_id, r.id);
  end if;
  if new.recommended_id <> new.author_id then
    insert into notifications (user_id, type, actor_id, request_id) values (new.recommended_id, 'rec_for_you', new.author_id, r.id);
  end if;
  return new;
end $$;
create trigger answers_after_insert after insert on public.request_answers for each row execute function public.after_answer();

-- ─────────────────────────────────────────────────────────────
-- Functions the apps call
-- ─────────────────────────────────────────────────────────────
-- The person a vouch is about posts (or clears) a short thank-you
create or replace function public.set_vouch_reply(p_vouch_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v vouches; txt text := nullif(btrim(p_reply), '');
begin
  select * into v from vouches where id = p_vouch_id and subject_id = auth.uid() and status = 'approved';
  if not found then raise exception 'Vouch not found' using errcode = '42501'; end if;
  update vouches set reply = txt, reply_at = case when txt is null then null else now() end where id = p_vouch_id;
  if txt is not null and v.reply is null then
    insert into notifications (user_id, type, vouch_id, actor_id) values (v.author_id, 'vouch_reply', v.id, v.subject_id);
  end if;
end $$;
revoke all on function public.set_vouch_reply(uuid, text) from anon;

-- Editing a vouch sends it back for approval and clears co-signs and the reply (the words changed)
create or replace function public.edit_my_vouch(
  p_vouch_id uuid, p_relationship text, p_duration text, p_traits text[], p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update vouches
     set relationship = p_relationship, duration = p_duration, traits = p_traits,
         body = p_body, status = 'pending', approved_at = null, reply = null, reply_at = null
   where id = p_vouch_id and author_id = auth.uid();
  if not found then raise exception 'Vouch not found' using errcode = '42501'; end if;
  delete from cosigns where vouch_id = p_vouch_id;
end $$;

-- Discover: people search with vouch counts. Hidden cities are never matched or returned.
create or replace function public.search_profiles(q text default '', near text default null, lim int default 30)
returns table (
  id uuid, username text, display_name text, headline text, city text, avatar_url text,
  theme text, style text, phone_verified boolean, vouches bigint, circles bigint, followers bigint
)
language sql stable set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.headline,
         case when p.show_city then p.city end, p.avatar_url, p.theme, p.style, p.phone_verified,
         coalesce(s.vouches, 0), coalesce(s.circles, 0),
         (select count(*) from follows f where f.followee_id = p.id)
    from profiles p
    left join (
      select subject_id, count(*) as vouches, count(distinct relationship) as circles
        from vouches where status = 'approved' group by subject_id
    ) s on s.subject_id = p.id
   where (coalesce(q, '') = ''
          or p.display_name ilike '%' || q || '%'
          or p.username::text ilike '%' || q || '%'
          or p.headline ilike '%' || q || '%'
          or (p.show_city and p.city ilike '%' || q || '%'))
     and (near is null or (p.show_city and p.city ilike near))
   order by coalesce(s.vouches, 0) desc, p.created_at desc
   limit least(greatest(lim, 1), 50)
$$;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.follows         enable row level security;
alter table public.cosigns         enable row level security;
alter table public.requests        enable row level security;
alter table public.request_answers enable row level security;

create policy "Follows are public"   on public.follows for select using (true);
create policy "Follow as yourself"   on public.follows for insert with check (follower_id = auth.uid());
create policy "Unfollow as yourself" on public.follows for delete using (follower_id = auth.uid());

create policy "Co-signs are public"    on public.cosigns for select using (true);
create policy "Co-sign as yourself"    on public.cosigns for insert with check (user_id = auth.uid());
create policy "Remove your co-sign"    on public.cosigns for delete using (user_id = auth.uid());

create policy "Signed-in people see asks" on public.requests for select to authenticated using (true);
create policy "Ask as yourself"           on public.requests for insert with check (author_id = auth.uid());
create policy "Delete your ask"           on public.requests for delete using (author_id = auth.uid());

create policy "Signed-in people see answers" on public.request_answers for select to authenticated using (true);
create policy "Answer as yourself"           on public.request_answers for insert with check (author_id = auth.uid());
create policy "Delete your answer, or answers on your ask" on public.request_answers for delete
  using (author_id = auth.uid() or exists (select 1 from requests r where r.id = request_id and r.author_id = auth.uid()));


-- New app routes can't be usernames
insert into public.reserved_usernames (username) values ('feed'),('discover'),('requests'),('written'),('me'),('reset-password')
on conflict do nothing;

-- ═════════ 0004_profile_plus.sql ═════════

-- Vouched: richer profiles, linked accounts, privacy + notification settings, vouch requests.

-- ─────────────────────────────────────────────────────────────
-- Profile fields
-- ─────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check
  check (theme in ('cobalt','forest','plum','ember','slate','rose'));

alter table public.profiles
  add column if not exists pronouns        text check (char_length(pronouns) <= 20),
  add column if not exists bio             text check (char_length(bio) <= 200),
  add column if not exists status          text check (status in ('work','hiring','clients','roommate','newtown','friends')),
  add column if not exists skills          text[] not null default '{}' check (cardinality(skills) <= 8),
  add column if not exists cover           text not null default 'dots' check (cover in ('solid','dots','grid','stripes','rings')),
  add column if not exists pinned_vouch_id uuid references public.vouches(id) on delete set null,
  add column if not exists who_can_vouch   text not null default 'everyone' check (who_can_vouch in ('everyone','following','nobody')),
  add column if not exists discoverable    boolean not null default true,
  add column if not exists show_counts     boolean not null default true,
  add column if not exists allow_cosigns   boolean not null default true;

-- Keep the older open_to_vouches flag in step, validate skills and the pinned vouch
create or replace function public.check_profile_extras() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if tg_op = 'UPDATE' and new.who_can_vouch is distinct from old.who_can_vouch then
    new.open_to_vouches := new.who_can_vouch <> 'nobody';
  elsif tg_op = 'UPDATE' and new.open_to_vouches is distinct from old.open_to_vouches then
    new.who_can_vouch := case when new.open_to_vouches then 'everyone' else 'nobody' end;
  end if;
  foreach s in array coalesce(new.skills, '{}') loop
    if char_length(s) < 1 or char_length(s) > 24 then
      raise exception 'Keep each skill between 1 and 24 characters' using errcode = '23514';
    end if;
  end loop;
  if new.pinned_vouch_id is not null and not exists (
    select 1 from vouches where id = new.pinned_vouch_id and subject_id = new.id and status = 'approved') then
    raise exception 'You can only pin a vouch that is on your page' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger profiles_extras before insert or update on public.profiles
  for each row execute function public.check_profile_extras();

-- Unpin a vouch that gets hidden
create or replace function public.unpin_hidden() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'approved' then
    update profiles set pinned_vouch_id = null where pinned_vouch_id = new.id;
  end if;
  return new;
end $$;
create trigger vouches_unpin after update of status on public.vouches
  for each row execute function public.unpin_hidden();

-- ─────────────────────────────────────────────────────────────
-- Linked accounts
-- ─────────────────────────────────────────────────────────────
create table public.profile_links (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform   text not null check (platform in ('instagram','tiktok','linkedin','x','youtube','facebook','website')),
  handle     text not null check (char_length(handle) between 1 and 80 and handle !~ '[\s<>"]'),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index profile_links_profile on public.profile_links (profile_id, position);

create or replace function public.limit_links() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from profile_links where profile_id = new.profile_id) >= 6 then
    raise exception 'You can link up to 6 accounts' using errcode = '23514';
  end if;
  if new.platform = 'website' and new.handle !~* '^(https?://)?[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' then
    raise exception 'That doesn''t look like a website address' using errcode = '23514';
  end if;
  if new.platform <> 'website' then
    new.handle := regexp_replace(new.handle, '^@', '');
    if new.handle !~ '^[A-Za-z0-9._-]{1,60}$' then
      raise exception 'Use just the username, like yourname' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger profile_links_before_insert before insert on public.profile_links
  for each row execute function public.limit_links();

alter table public.profile_links enable row level security;
create policy "Links are public"       on public.profile_links for select using (true);
create policy "Add your own links"     on public.profile_links for insert with check (profile_id = auth.uid());
create policy "Reorder your own links" on public.profile_links for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "Remove your own links"  on public.profile_links for delete using (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Notification preferences (private to each person)
-- ─────────────────────────────────────────────────────────────
create table public.user_settings (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  notify_vouches  boolean not null default true,
  notify_requests boolean not null default true,
  notify_follows  boolean not null default true,
  notify_cosigns  boolean not null default true,
  notify_recs     boolean not null default true,
  email_weekly    boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "Read your settings"   on public.user_settings for select using (user_id = auth.uid());
create policy "Create your settings" on public.user_settings for insert with check (user_id = auth.uid());
create policy "Change your settings" on public.user_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Vouch requests ("Would you vouch for me?")
-- ─────────────────────────────────────────────────────────────
create table public.vouch_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
create unique index vouch_requests_open on public.vouch_requests (requester_id, recipient_id) where not done;
create index vouch_requests_recipient on public.vouch_requests (recipient_id, done, created_at desc);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_vouch','vouch_approved','new_follower','cosign','vouch_reply','rec_answer','rec_for_you','vouch_request'));

create or replace function public.on_vouch_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  new.done := false;
  if is_blocked(new.recipient_id, new.requester_id) then
    raise exception 'You can''t ask this person' using errcode = '42501';
  end if;
  if exists (select 1 from vouches where subject_id = new.requester_id and author_id = new.recipient_id) then
    raise exception 'They already vouched for you' using errcode = '23514';
  end if;
  select count(*) into recent from vouch_requests where requester_id = new.requester_id and created_at > now() - interval '24 hours';
  if recent >= 30 then
    raise exception 'You''ve hit today''s limit for vouch requests.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger vouch_requests_before_insert before insert on public.vouch_requests
  for each row execute function public.on_vouch_request();

create or replace function public.after_vouch_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select notify_requests from user_settings where user_id = new.recipient_id), true) then
    insert into notifications (user_id, type, actor_id) values (new.recipient_id, 'vouch_request', new.requester_id);
  end if;
  return new;
end $$;
create trigger vouch_requests_after_insert after insert on public.vouch_requests
  for each row execute function public.after_vouch_request();

alter table public.vouch_requests enable row level security;
create policy "See requests you sent or got" on public.vouch_requests for select using (auth.uid() in (requester_id, recipient_id));
create policy "Ask as yourself"              on public.vouch_requests for insert with check (requester_id = auth.uid());
create policy "Cancel or dismiss a request"  on public.vouch_requests for delete using (auth.uid() in (requester_id, recipient_id));

-- ─────────────────────────────────────────────────────────────
-- Vouch rules: who can vouch, close requests, respect co-sign setting
-- ─────────────────────────────────────────────────────────────
create or replace function public.before_vouch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int; who text;
begin
  new.status := 'pending';
  new.approved_at := null;
  select who_can_vouch into who from profiles where id = new.subject_id;
  if who is null or who = 'nobody' then
    raise exception 'This person is not taking vouches right now' using errcode = '42501';
  end if;
  if who = 'following' and not exists (select 1 from follows where follower_id = new.subject_id and followee_id = new.author_id) then
    raise exception 'This person only takes vouches from people they follow' using errcode = '42501';
  end if;
  if is_blocked(new.subject_id, new.author_id) then
    raise exception 'You can''t vouch for this person' using errcode = '42501';
  end if;
  select count(*) into recent from vouches where author_id = new.author_id and created_at > now() - interval '24 hours';
  if recent >= 20 then
    raise exception 'You''ve hit today''s vouch limit. Try again tomorrow.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.after_vouch_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select notify_vouches from user_settings where user_id = new.subject_id), true) then
    insert into notifications (user_id, type, vouch_id, actor_id) values (new.subject_id, 'new_vouch', new.id, new.author_id);
  end if;
  update vouch_requests set done = true where requester_id = new.subject_id and recipient_id = new.author_id and not done;
  return new;
end $$;

create or replace function public.on_cosign() returns trigger
language plpgsql security definer set search_path = public as $$
declare v vouches;
begin
  select * into v from vouches where id = new.vouch_id;
  if not found or v.status <> 'approved' then
    raise exception 'You can only co-sign vouches that are on someone''s page' using errcode = '42501';
  end if;
  if new.user_id in (v.subject_id, v.author_id) then
    raise exception 'You can''t co-sign a vouch you wrote or received' using errcode = '42501';
  end if;
  if is_blocked(v.subject_id, new.user_id) then
    raise exception 'You can''t co-sign vouches for this person' using errcode = '42501';
  end if;
  if not (select allow_cosigns from profiles where id = v.subject_id) then
    raise exception 'This person has turned off co-signs' using errcode = '42501';
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Discover search: skills, status filter, hidden profiles
-- ─────────────────────────────────────────────────────────────
drop function if exists public.search_profiles(text, text, int);
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
   where p.discoverable
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

insert into public.reserved_usernames (username) values ('search'),('activity'),('edit'),('people')
on conflict do nothing;

-- ═════════ 0005_vouched_in.sql ═════════

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

-- ═════════ 0006_beta.sql ═════════

-- 0006: first beta
--   • Push notifications (Expo push tokens, sent from the database with pg_net)
--   • Moderation: admins, report queue, remove / restore members
--   • A permanent record of removals, so a removed scammer deleting their account
--     doesn't wipe the mark from the people who backed them
--   • In-app feedback
--   • "Scam or fraud" as a report reason

-- ─────────────────────────────────────────────────────────────
-- Admins
-- ─────────────────────────────────────────────────────────────
create table public.admins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "See whether you are an admin" on public.admins for select using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Reports: scam reason + a review status
-- ─────────────────────────────────────────────────────────────
alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('scam','fake','harassment','private_info','spam','other'));
alter table public.reports
  add column status      text not null default 'open' check (status in ('open','dismissed','actioned')),
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.profiles(id) on delete set null,
  add column admin_note  text check (char_length(admin_note) <= 500);
create index reports_status on public.reports (status, created_at desc);
-- Keep reports after the reported vouch or account is deleted (and let reported people delete their account).
alter table public.reports drop constraint if exists reports_check;

-- ─────────────────────────────────────────────────────────────
-- Permanent removal record (survives the removed account being deleted)
-- ─────────────────────────────────────────────────────────────
create table public.removed_backers (
  removed_id uuid not null,                 -- no FK on purpose: the removed account may be deleted later
  backer_id  uuid not null references public.profiles(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (removed_id, backer_id)
);
create index removed_backers_backer on public.removed_backers (backer_id);
alter table public.removed_backers enable row level security;   -- only definer functions touch it

create or replace function public.after_standing_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.standing = 'removed' and old.standing <> 'removed' then
    insert into removed_backers (removed_id, backer_id)
      select new.id, v.author_id from vouches v where v.subject_id = new.id and v.status = 'approved'
      union
      select new.id, new.invited_by where new.invited_by is not null
    on conflict do nothing;
    -- Their vouches for other people stop counting.
    update vouches set status = 'hidden' where author_id = new.id and status <> 'hidden';
  elsif new.standing = 'good' and old.standing = 'removed' then
    delete from removed_backers where removed_id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_after_standing after update of standing on public.profiles
  for each row execute function public.after_standing_change();

create or replace function public.track_record(p_user uuid)
returns table (backed int, removed int, weight numeric)
language sql stable security definer set search_path = public as $$
  with b as (
    select subject_id as id from vouches where author_id = p_user and status = 'approved'
    union
    select id from profiles where invited_by = p_user
  ),
  r as (
    select removed_id as id from removed_backers where backer_id = p_user
    union
    select b.id from b join profiles p on p.id = b.id and p.standing = 'removed'
  ),
  allb as (select id from b union select id from r)
  select (select count(*) from allb)::int,
         (select count(*) from r)::int,
         case when (select count(*) from allb) = 0 then 1.00
              else round(greatest(0.25, 1 - 2.0 * (select count(*) from r) / (select count(*) from allb)), 2) end
$$;

-- ─────────────────────────────────────────────────────────────
-- Moderation RPCs (admins only)
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_reports(status_filter text default 'open', lim int default 100)
returns table (
  id uuid, reason text, details text, status text, created_at timestamptz, admin_note text,
  reporter_username text,
  profile_id uuid, profile_username text, profile_name text, profile_standing text,
  vouch_id uuid, vouch_body text, vouch_status text,
  vouch_author_id uuid, vouch_author_username text, vouch_subject_username text,
  reports_on_target bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select r.id, r.reason, r.details, r.status, r.created_at, r.admin_note,
         rp.username::text,
         tp.id, tp.username::text, tp.display_name, tp.standing,
         v.id, v.body, v.status,
         va.id, va.username::text, vs.username::text,
         (select count(*) from reports r2
           where (r.profile_id is not null and r2.profile_id = r.profile_id)
              or (r.vouch_id is not null and r2.vouch_id = r.vouch_id))
    from reports r
    left join profiles rp on rp.id = r.reporter_id
    left join profiles tp on tp.id = r.profile_id
    left join vouches  v  on v.id = r.vouch_id
    left join profiles va on va.id = v.author_id
    left join profiles vs on vs.id = v.subject_id
   where status_filter is null or r.status = status_filter
   order by r.created_at desc
   limit least(greatest(lim, 1), 500);
end $$;

create or replace function public.admin_set_standing(p_user uuid, p_standing text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if p_standing not in ('good', 'removed') then raise exception 'Unknown standing' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'You can''t remove yourself' using errcode = '42501'; end if;
  update profiles set standing = p_standing where id = p_user;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r reports; target uuid;
begin
  perform require_admin();
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if p_action = 'dismiss' then
    null;
  elsif p_action = 'hide_vouch' then
    update vouches set status = 'hidden' where id = r.vouch_id;
  elsif p_action = 'delete_vouch' then
    delete from vouches where id = r.vouch_id;
  elsif p_action = 'remove_member' then
    target := coalesce(r.profile_id, (select author_id from vouches where id = r.vouch_id));
    if target is null then raise exception 'Nobody to remove on this report' using errcode = '22023'; end if;
    perform admin_set_standing(target, 'removed');
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  update reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
                     resolved_at = now(), resolved_by = auth.uid(), admin_note = p_note
   where id = p_report;
end $$;

create or replace function public.admin_stats()
returns table (members bigint, joined_7d bigint, vouches bigint, props bigint, open_reports bigint, removed bigint, feedback_7d bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query select
    (select count(*) from profiles where standing = 'good'),
    (select count(*) from profiles where created_at > now() - interval '7 days'),
    (select count(*) from vouches where status = 'approved'),
    (select count(*) from props),
    (select count(*) from reports where status = 'open'),
    (select count(*) from profiles where standing = 'removed'),
    (select count(*) from feedback where created_at > now() - interval '7 days');
end $$;

-- ─────────────────────────────────────────────────────────────
-- Beta feedback
-- ─────────────────────────────────────────────────────────────
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('bug','idea','other')),
  body        text not null check (char_length(btrim(body)) between 3 and 2000),
  platform    text check (platform in ('web','ios','android')),
  app_version text check (char_length(app_version) <= 40),
  page        text check (char_length(page) <= 200),
  created_at  timestamptz not null default now()
);
create index feedback_created on public.feedback (created_at desc);
alter table public.feedback enable row level security;
create policy "Send feedback as yourself" on public.feedback for insert with check (user_id = auth.uid());
create policy "Admins read feedback" on public.feedback for select using (is_admin());

create or replace function public.admin_feedback(lim int default 100)
returns table (id uuid, kind text, body text, platform text, app_version text, page text, created_at timestamptz, username text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query select f.id, f.kind, f.body, f.platform, f.app_version, f.page, f.created_at, p.username::text
    from feedback f left join profiles p on p.id = f.user_id
   order by f.created_at desc limit least(greatest(lim, 1), 500);
end $$;

insert into public.app_config (key, value) values ('beta', 'on') on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Push notifications
-- ─────────────────────────────────────────────────────────────
create table public.push_tokens (
  token      text primary key check (token like 'ExponentPushToken[%' or token like 'ExpoPushToken[%'),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text check (platform in ('ios','android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "See your push tokens" on public.push_tokens for select using (user_id = auth.uid());
create policy "Remove your push tokens" on public.push_tokens for delete using (user_id = auth.uid());

-- A phone can change hands, so registering moves the token to whoever is signed in now.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into push_tokens (token, user_id, platform, updated_at) values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid()
$$;

-- What the lock-screen notification says, and where tapping it goes.
create or replace function public.push_message(n notifications)
returns table (title text, body text, url text)
language sql stable security definer set search_path = public as $$
  select
    case n.type when 'props' then 'You got props' when 'new_vouch' then 'New vouch' else 'Vouched' end,
    case n.type
      when 'props'          then 'Someone picked you for “' || coalesce((select label from prompts where id = n.prompt_id), 'props') || '”'
      when 'new_vouch'      then coalesce(a.display_name, 'Someone') || ' put their name on you. Review it to add it to your page.'
      when 'vouch_approved' then coalesce(a.display_name, 'Someone') || ' added your vouch to their page.'
      when 'new_follower'   then coalesce(a.display_name, 'Someone') || ' started following you.'
      when 'cosign'         then coalesce(a.display_name, 'Someone') || ' co-signed a vouch you’re part of.'
      when 'vouch_reply'    then coalesce(a.display_name, 'Someone') || ' replied to your vouch.'
      when 'rec_answer'     then coalesce(a.display_name, 'Someone') || ' answered your ask.'
      when 'rec_for_you'    then coalesce(a.display_name, 'Someone') || ' recommended you to someone.'
      when 'vouch_request'  then coalesce(a.display_name, 'Someone') || ' asked you for a vouch.'
      when 'invite_joined'  then coalesce(a.display_name, 'Someone') || ' joined with your invite.'
      else 'You have new activity.'
    end,
    case
      when n.request_id is not null then '/requests/' || n.request_id
      when n.type in ('new_follower', 'invite_joined') and a.username is not null then '/' || a.username
      else '/inbox'
    end
  from (select 1) x left join profiles a on a.id = n.actor_id
$$;

create or replace function public.after_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare msgs jsonb; m record;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return new; end if;
  select * into m from push_message(new);
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', m.title, 'body', m.body, 'sound', 'default',
                                      'data', jsonb_build_object('url', m.url)))
    into msgs from push_tokens t where t.user_id = new.user_id;
  if msgs is null then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', msgs, '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb;
  return new;
exception when others then
  return new;   -- a push problem must never block the notification itself
end $$;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.after_notification_push();

-- pg_net ships with Supabase. (Enable it under Database → Extensions if this line is skipped.)
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available here; push notifications stay off until it is enabled.';
end $$;

revoke all on function public.admin_reports(text, int)               from public, anon;
revoke all on function public.admin_set_standing(uuid, text)         from public, anon;
revoke all on function public.admin_resolve_report(uuid, text, text) from public, anon;
revoke all on function public.admin_stats()                          from public, anon;
revoke all on function public.admin_feedback(int)                    from public, anon;
revoke all on function public.register_push_token(text, text)        from public, anon;
revoke all on function public.unregister_push_token(text)            from public, anon;
revoke all on function public.push_message(notifications)            from public, anon, authenticated;
grant execute on function public.admin_reports(text, int), public.admin_set_standing(uuid, text),
  public.admin_resolve_report(uuid, text, text), public.admin_stats(), public.admin_feedback(int),
  public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;

-- ═════════ 0007_social_v2.sql ═════════

-- 0007: Social v2
--   • Trust score (0–100, owner-only) and public tiers: New / Known / Trusted / Highly trusted.
--     It can go down: withdrawn vouches, private "wouldn't vouch again", removed people you backed,
--     confirmed scam reports, vouches older than a year, and going quiet.
--   • Personality chart from anonymous poll votes + vouch traits.
--   • Daily polls: 5 questions a day that change at noon, a streak, weekly results.
--   • Gifts (1 free a day; never touch trust), reactions, comments.
--   • "What's my vibe?" answers, private feedback, "would you vouch again?", withdraw a vouch.
--   • Profile view counts, Work mode, calmer push notifications.

-- ─────────────────────────────────────────────────────────────
-- Settings
-- ─────────────────────────────────────────────────────────────
insert into public.app_config (key, value) values
  ('daily_gifts', '1'),
  ('drop_tz', 'America/Indiana/Indianapolis'),
  ('daily_push_cap', '5')
on conflict (key) do nothing;
update public.app_config set value = '5' where key = 'daily_props';

create or replace function public.config_text(k text, fallback text) returns text
language sql stable set search_path = public as $$
  select coalesce((select value from app_config where key = k), fallback)
$$;

-- A "drop day" starts at noon local time, so the new polls land at lunch.
create or replace function public.drop_day(at timestamptz default now()) returns date
language sql stable set search_path = public as $$
  select ((at at time zone config_text('drop_tz', 'America/Indiana/Indianapolis')) - interval '12 hours')::date
$$;
create or replace function public.drop_start() returns timestamptz
language sql stable set search_path = public as $$
  select (drop_day() + time '12:00') at time zone config_text('drop_tz', 'America/Indiana/Indianapolis')
$$;
create or replace function public.local_day_start() returns timestamptz
language sql stable set search_path = public as $$
  select date_trunc('day', now() at time zone config_text('drop_tz', 'America/Indiana/Indianapolis'))
         at time zone config_text('drop_tz', 'America/Indiana/Indianapolis')
$$;

-- ─────────────────────────────────────────────────────────────
-- Profiles: verification, activity, Work mode, hidden poll titles
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists id_verified    boolean     not null default false,
  add column if not exists last_active_at timestamptz not null default now(),
  add column if not exists work_mode      boolean     not null default false,
  add column if not exists hidden_prompts smallint[]  not null default '{}' check (cardinality(hidden_prompts) <= 40);
-- People who already said they're working or hiring keep their work info visible.
update public.profiles set work_mode = true where status in ('work', 'clients', 'hiring');

-- Members can't mark themselves ID-verified or fake recent activity.
create or replace function public.protect_profile_signals() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user::text in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.id_verified := false; new.last_active_at := now();
    else
      new.id_verified := old.id_verified; new.last_active_at := old.last_active_at;
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect_signals before insert or update on public.profiles
  for each row execute function public.protect_profile_signals();

create or replace function public.touch_active(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update profiles set last_active_at = now()
   where id = p_user and last_active_at < now() - interval '10 minutes'
$$;
revoke all on function public.touch_active(uuid) from public, anon, authenticated;

-- More ways to know someone
alter table public.vouches drop constraint if exists vouches_relationship_check;
alter table public.vouches add constraint vouches_relationship_check
  check (relationship in ('Best friend','Friend','Family','Partner','Roommate','Coworker','Client','Teammate','Classmate','Neighbor'));

-- ─────────────────────────────────────────────────────────────
-- Notifications: new kinds + calm mode
-- ─────────────────────────────────────────────────────────────
alter table public.notifications
  add column if not exists ref_id uuid,
  add column if not exists meta   jsonb;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_vouch','vouch_approved','new_follower','cosign','vouch_reply','rec_answer','rec_for_you',
                  'vouch_request','props','invite_joined','gift','reaction','comment','vibe','private_note'));
alter table public.user_settings
  add column if not exists notify_gifts    boolean not null default true,
  add column if not exists notify_social   boolean not null default true,   -- reactions + comments
  add column if not exists calm_notifications boolean not null default true;

create or replace function public.wants(p_user uuid, setting text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((to_jsonb(s) ->> setting)::boolean, true) from (select 1) x
    left join user_settings s on s.user_id = p_user
$$;
revoke all on function public.wants(uuid, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Daily polls (built on props)
-- ─────────────────────────────────────────────────────────────
alter table public.prompts
  add column if not exists trait text check (trait in ('Funny','Reliable','Kind','Chaotic','Smart','Loyal','Adventurous')),
  add column if not exists emoji text;
update public.prompts p set trait = v.trait, emoji = v.emoji from (values
  (1,'Loyal','🌙'),(2,'Reliable','💸'),(3,'Reliable','🔑'),(4,'Reliable','🛠️'),(5,'Smart','🧠'),
  (6,'Funny','🎉'),(7,'Reliable','💼'),(8,'Smart','🧘'),(9,'Reliable','⏰'),(10,'Kind','🐶')
) v(id, trait, emoji) where p.id = v.id;
insert into public.prompts (id, question, label, icon, trait, emoji) values
  (11, 'Most likely to survive a zombie apocalypse',   'Zombie survivor', 'shield',  'Adventurous', '🧟'),
  (12, 'Most likely to show up 20 minutes late',       'Always late',     'clock',   'Chaotic',     '⏰'),
  (13, 'Funniest person in the group chat',            'Group chat MVP',  'sparkle', 'Funny',       '😂'),
  (14, 'Friend you’d call from jail',                  'Jail call',       'shield',  'Loyal',       '🚔'),
  (15, 'Most likely to become famous',                 'Future famous',   'sparkle', 'Adventurous', '🌟'),
  (16, 'Worst driver you know',                        'Worst driver',    'sparkle', 'Chaotic',     '🚗'),
  (17, 'Kindest person you know',                      'Kindest',         'gift',    'Kind',        '🫶'),
  (18, 'Most likely to start drama',                   'Drama starter',   'sparkle', 'Chaotic',     '🍿'),
  (19, 'Best road trip partner',                       'Road trip pick',  'sparkle', 'Funny',       '🛣️'),
  (20, 'Who remembers everyone’s birthday?',           'Birthday keeper', 'gift',    'Kind',        '🎂'),
  (21, 'Smartest person you know',                     'Big brain',       'msg',     'Smart',       '📚'),
  (22, 'Who would you take on a last-minute trip?',    'Spontaneous',     'sparkle', 'Adventurous', '✈️')
on conflict (id) do nothing;
alter table public.prompts alter column trait set not null;

-- Today's 5 questions: the same for everyone, reshuffled each drop day.
create or replace function public.today_prompts(d date default null)
returns table (id smallint, question text, label text, icon text, emoji text, trait text)
language sql stable set search_path = public as $$
  select q.id, q.question, q.label, q.icon, q.emoji, q.trait from prompts q
   where q.active
   order by md5(q.id::text || coalesce(d, drop_day())::text)
   limit greatest(config_int('daily_props', 5), 1)
$$;

create or replace function public.today_drop()
returns table (id smallint, question text, label text, icon text, emoji text, trait text, answered boolean)
language sql stable security definer set search_path = public as $$
  select t.*, exists (select 1 from props x where x.giver_id = auth.uid() and x.prompt_id = t.id and x.created_at >= drop_start())
    from today_prompts() t
$$;

create or replace function public.before_props_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if (select standing from profiles where id = new.giver_id) is distinct from 'good'
     or (select standing from profiles where id = new.receiver_id) is distinct from 'good' then
    raise exception 'You can''t pick this person' using errcode = '42501';
  end if;
  if is_blocked(new.receiver_id, new.giver_id) or is_blocked(new.giver_id, new.receiver_id) then
    raise exception 'You can''t pick this person' using errcode = '42501';
  end if;
  if not exists (select 1 from today_prompts() t where t.id = new.prompt_id) then
    raise exception 'That question isn''t in today''s polls' using errcode = '22023';
  end if;
  if exists (select 1 from props where giver_id = new.giver_id and prompt_id = new.prompt_id and created_at >= drop_start()) then
    raise exception 'You already answered this one today' using errcode = '23505';
  end if;
  if (select count(*) from props where giver_id = new.giver_id and created_at >= drop_start()) >= config_int('daily_props', 5) then
    raise exception 'That''s today''s polls done. New ones at noon.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Consecutive drop days you played, counting today or yesterday.
create or replace function public.my_streak() returns int
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct drop_day(created_at) as day from props where giver_id = auth.uid()
  ), g as (
    select day, day - (row_number() over (order by day))::int as grp from d
  ), last as (select max(day) as day from d)
  select case when (select day from last) is null or (select day from last) < drop_day() - 1 then 0
              else (select count(*)::int from g where grp = (select grp from g where day = (select day from last))) end
$$;

-- Your week: what friends voted you in the last 7 days (who voted stays secret).
create or replace function public.my_week()
returns table (prompt_id smallint, question text, label text, emoji text, trait text, n bigint)
language sql stable security definer set search_path = public as $$
  select q.id, q.question, q.label, q.emoji, q.trait, count(*)
    from props x join prompts q on q.id = x.prompt_id
   where x.receiver_id = auth.uid() and x.created_at > now() - interval '7 days'
   group by q.id order by count(*) desc, q.id
$$;

-- Public "Known for" titles; people can hide any title from their page.
drop function if exists public.props_summary(uuid);
create function public.props_summary(p_user uuid)
returns table (prompt_id smallint, label text, icon text, emoji text, n bigint)
language sql stable security definer set search_path = public as $$
  select q.id, q.label, q.icon, q.emoji, count(*)
    from props x join prompts q on q.id = x.prompt_id
    join profiles p on p.id = x.receiver_id and p.standing = 'good'
   where x.receiver_id = p_user and not q.id = any(p.hidden_prompts)
   group by q.id, q.label, q.icon, q.emoji
   order by count(*) desc, q.id
$$;

-- Feed cards: "Marcus was voted 2am call · 4 votes" for people you follow (3+ votes this week).
create or replace function public.feed_results(lim int default 10)
returns table (user_id uuid, username text, display_name text, avatar_url text,
               prompt_id smallint, question text, label text, emoji text, n bigint)
language sql stable security definer set search_path = public as $$
  select distinct on (p.id) p.id, p.username::text, p.display_name, p.avatar_url, q.id, q.question, q.label, q.emoji, c.n
    from follows f
    join profiles p on p.id = f.followee_id and p.standing = 'good'
    join lateral (
      select x.prompt_id, count(*) as n from props x
       where x.receiver_id = p.id and x.created_at > now() - interval '7 days'
       group by x.prompt_id
    ) c on c.n >= 3
    join prompts q on q.id = c.prompt_id and not q.id = any(p.hidden_prompts)
   where f.follower_id = auth.uid()
   order by p.id, c.n desc
   limit least(greatest(lim, 1), 30)
$$;

-- ─────────────────────────────────────────────────────────────
-- Personality: 7 traits, each 0–1 relative to the person's strongest
-- ─────────────────────────────────────────────────────────────
create or replace function public.personality(p_user uuid)
returns table (trait text, score numeric, votes bigint)
language sql stable security definer set search_path = public as $$
  with axes(trait, ord) as (values ('Funny',1),('Reliable',2),('Kind',3),('Chaotic',4),('Smart',5),('Loyal',6),('Adventurous',7)),
  tmap(tr, trait) as (values
    ('Funny','Funny'),('Honest','Smart'),('Loyal','Loyal'),('Always there','Loyal'),('Reliable','Reliable'),
    ('Keeps their word','Reliable'),('On time','Reliable'),('Pays back','Reliable'),('Hard worker','Reliable'),
    ('Kind','Kind'),('Generous','Kind'),('Great listener','Kind'),('Calm in a crisis','Smart'),('Skilled','Smart')),
  ok as (select 1 from profiles where id = p_user and standing = 'good'),
  raw as (
    select q.trait, 1.0 as w, 1 as vote from props x join prompts q on q.id = x.prompt_id
     where x.receiver_id = p_user and exists (select 1 from ok)
    union all
    select m.trait, 0.7, 0 from vouches v cross join unnest(v.traits) t(tr) join tmap m on m.tr = t.tr
     where v.subject_id = p_user and v.status = 'approved' and exists (select 1 from ok)
  ),
  s as (select trait, sum(w) as n, sum(vote) as votes from raw group by trait)
  select a.trait,
         coalesce(round(s.n / nullif(max(s.n) over (), 0), 2), 0),
         coalesce(s.votes, 0)::bigint
    from axes a left join s using (trait)
   order by a.ord
$$;

-- ─────────────────────────────────────────────────────────────
-- Withdrawn vouches (a permanent record, even though the vouch is deleted)
-- ─────────────────────────────────────────────────────────────
create table public.vouch_withdrawals (
  subject_id uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid not null,
  created_at timestamptz not null default now()
);
create index vouch_withdrawals_subject on public.vouch_withdrawals (subject_id, created_at desc);
alter table public.vouch_withdrawals enable row level security;   -- definer functions only

-- An author deleting an approved vouch is a withdrawal. A subject hiding/deleting one is not.
-- (Deleting your whole account doesn't count against the people you vouched for.)
create or replace function public.after_vouch_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved' and auth.uid() = old.author_id
     and exists (select 1 from profiles where id = old.author_id)
     and exists (select 1 from profiles where id = old.subject_id) then
    insert into vouch_withdrawals (subject_id, author_id) values (old.subject_id, old.author_id);
  end if;
  delete from reactions where target_type = 'vouch' and target_id = old.id;
  delete from comments  where target_type = 'vouch' and target_id = old.id;
  return old;
end $$;

create or replace function public.withdraw_vouch(p_vouch_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vouches where id = p_vouch_id and author_id = auth.uid()) then
    raise exception 'Vouch not found' using errcode = '42501';
  end if;
  delete from vouches where id = p_vouch_id;
end $$;

-- "Would you still vouch for them?" Private: only the answer's effect on the score is ever visible.
create table public.vouch_checkins (
  author_id  uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  yes        boolean not null,
  created_at timestamptz not null default now(),
  primary key (author_id, subject_id)
);
alter table public.vouch_checkins enable row level security;
create policy "See your own check-ins" on public.vouch_checkins for select using (author_id = auth.uid());

create or replace function public.answer_vouch_again(p_subject uuid, p_yes boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vouches where author_id = auth.uid() and subject_id = p_subject and status = 'approved') then
    raise exception 'You haven''t vouched for this person' using errcode = '42501';
  end if;
  insert into vouch_checkins (author_id, subject_id, yes) values (auth.uid(), p_subject, p_yes)
  on conflict (author_id, subject_id) do update set yes = excluded.yes, created_at = now();
end $$;

-- One check-in at a time, for vouches that are 3+ months old and not checked in 6 months.
create or replace function public.vouch_again_due()
returns table (subject_id uuid, username text, display_name text, avatar_url text, vouched_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, coalesce(v.approved_at, v.created_at)
    from vouches v join profiles p on p.id = v.subject_id and p.standing = 'good'
   where v.author_id = auth.uid() and v.status = 'approved'
     and coalesce(v.approved_at, v.created_at) < now() - interval '90 days'
     and not exists (select 1 from vouch_checkins c where c.author_id = v.author_id and c.subject_id = v.subject_id
                       and c.created_at > now() - interval '180 days')
   order by coalesce(v.approved_at, v.created_at)
   limit 1
$$;

-- ─────────────────────────────────────────────────────────────
-- Gifts
-- ─────────────────────────────────────────────────────────────
create table public.gift_types (
  key     text primary key,
  emoji   text not null,
  label   text not null,
  premium boolean not null default false,
  sort    int not null default 0,
  active  boolean not null default true
);
alter table public.gift_types enable row level security;
create policy "Gift types are public" on public.gift_types for select using (true);
insert into public.gift_types (key, emoji, label, premium, sort) values
  ('coffee','☕','Coffee',false,1),('five','🙌','High five',false,2),('flowers','💐','Flowers',false,3),
  ('shield','🛡️','Got your back',false,4),('fire','🔥','You ate',false,5),('love','🫶','Love you',false,6),
  ('crown','👑','Crown',true,10),('trophy','🏆','Trophy',true,11),('diamond','💎','Diamond',true,12);

create table public.gifts (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  gift        text not null references public.gift_types(key),
  note        text check (char_length(note) <= 80),
  created_at  timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create index gifts_receiver on public.gifts (receiver_id, created_at desc);
create index gifts_sender   on public.gifts (sender_id, created_at desc);
alter table public.gifts enable row level security;
create policy "Gifts are public"         on public.gifts for select using (true);
create policy "Send gifts as yourself"   on public.gifts for insert with check (sender_id = auth.uid());
create policy "Sender or receiver can remove a gift" on public.gifts for delete using (auth.uid() in (sender_id, receiver_id));

create or replace function public.gifts_left_today() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, config_int('daily_gifts', 1) -
         (select count(*)::int from gifts where sender_id = auth.uid() and created_at >= local_day_start()))
   where auth.uid() is not null
$$;

create or replace function public.before_gift_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare g gift_types;
begin
  new.created_at := now();
  new.note := nullif(btrim(new.note), '');
  if (select standing from profiles where id = new.sender_id) is distinct from 'good'
     or (select standing from profiles where id = new.receiver_id) is distinct from 'good'
     or is_blocked(new.receiver_id, new.sender_id) or is_blocked(new.sender_id, new.receiver_id) then
    raise exception 'You can''t send a gift to this person' using errcode = '42501';
  end if;
  select * into g from gift_types where key = new.gift and active;
  if not found then raise exception 'That gift isn''t available' using errcode = '22023'; end if;
  if g.premium then raise exception 'Premium gifts are coming soon' using errcode = '42501'; end if;
  if (select count(*) from gifts where sender_id = new.sender_id and created_at >= local_day_start()) >= config_int('daily_gifts', 1) then
    raise exception 'You''ve sent today''s free gift. Another one tomorrow.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger gifts_before_insert before insert on public.gifts
  for each row execute function public.before_gift_insert();

create or replace function public.after_gift_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform touch_active(new.sender_id);
  if wants(new.receiver_id, 'notify_gifts') then
    insert into notifications (user_id, type, actor_id, ref_id, meta)
    values (new.receiver_id, 'gift', new.sender_id, new.id,
            jsonb_build_object('gift', new.gift, 'emoji', (select emoji from gift_types where key = new.gift),
                               'label', (select label from gift_types where key = new.gift)));
  end if;
  return new;
end $$;
create trigger gifts_after_insert after insert on public.gifts
  for each row execute function public.after_gift_insert();

-- ─────────────────────────────────────────────────────────────
-- Reactions and comments (on vouches and gifts)
-- ─────────────────────────────────────────────────────────────
create table public.reactions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('vouch','gift')),
  target_id   uuid not null,
  emoji       text not null check (emoji in ('🔥','😭','🫡','🙌','❤️')),
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index reactions_target on public.reactions (target_type, target_id);
alter table public.reactions enable row level security;
create policy "Reactions are public"     on public.reactions for select using (true);
create policy "React as yourself"        on public.reactions for insert with check (user_id = auth.uid());
create policy "Change your reaction"     on public.reactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Remove your reaction"     on public.reactions for delete using (user_id = auth.uid());

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('vouch','gift')),
  target_id   uuid not null,
  body        text not null check (char_length(btrim(body)) between 1 and 200),
  created_at  timestamptz not null default now()
);
create index comments_target on public.comments (target_type, target_id, created_at);
alter table public.comments enable row level security;

-- Who a vouch/gift "belongs to" (gets the notification, can remove comments), and whether it's public.
create or replace function public.target_owner(p_type text, p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'vouch' then (select subject_id  from vouches where id = p_id and status = 'approved')
    when 'gift'  then (select receiver_id from gifts   where id = p_id)
  end
$$;

create policy "Comments on public posts are public" on public.comments for select
  using (target_owner(target_type, target_id) is not null);
create policy "Comment as yourself" on public.comments for insert with check (author_id = auth.uid());
create policy "Remove your comment, or one on your post" on public.comments for delete
  using (author_id = auth.uid() or target_owner(target_type, target_id) = auth.uid());

create or replace function public.before_social_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; actor uuid;
begin
  actor := coalesce(to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'author_id')::uuid;
  owner := target_owner(new.target_type, new.target_id);
  if owner is null then raise exception 'That post isn''t available' using errcode = '22023'; end if;
  if (select standing from profiles where id = actor) is distinct from 'good'
     or is_blocked(owner, actor) or is_blocked(actor, owner) then
    raise exception 'You can''t interact with this post' using errcode = '42501';
  end if;
  if tg_table_name = 'comments' then
    new.body := btrim(new.body);
    new.created_at := now();
    if (select count(*) from comments where author_id = actor and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'Slow down a little. Try again in a bit.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger reactions_before_insert before insert on public.reactions
  for each row execute function public.before_social_insert();
create trigger comments_before_insert before insert on public.comments
  for each row execute function public.before_social_insert();

create or replace function public.after_social_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; actor uuid;
begin
  actor := coalesce(to_jsonb(new) ->> 'user_id', to_jsonb(new) ->> 'author_id')::uuid;
  owner := target_owner(new.target_type, new.target_id);
  perform touch_active(actor);
  if owner is null or owner = actor or not wants(owner, 'notify_social') then return new; end if;
  if tg_table_name = 'reactions' then
    -- One reaction notification per person per post per day, however often they toggle it.
    if not exists (select 1 from notifications where user_id = owner and type = 'reaction' and actor_id = actor
                     and ref_id = new.target_id and created_at > now() - interval '1 day') then
      insert into notifications (user_id, type, actor_id, ref_id, meta)
      values (owner, 'reaction', actor, new.target_id, jsonb_build_object('emoji', new.emoji, 'target', new.target_type));
    end if;
  else
    insert into notifications (user_id, type, actor_id, ref_id, meta)
    values (owner, 'comment', actor, new.target_id, jsonb_build_object('text', left(new.body, 100), 'target', new.target_type));
  end if;
  return new;
end $$;
create trigger reactions_after_insert after insert on public.reactions
  for each row execute function public.after_social_insert();
create trigger comments_after_insert after insert on public.comments
  for each row execute function public.after_social_insert();

create or replace function public.after_gift_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from reactions where target_type = 'gift' and target_id = old.id;
  delete from comments  where target_type = 'gift' and target_id = old.id;
  return old;
end $$;
create trigger gifts_after_delete after delete on public.gifts
  for each row execute function public.after_gift_delete();
create trigger vouches_after_delete after delete on public.vouches
  for each row execute function public.after_vouch_delete();

-- Counts for a batch of posts, plus the viewer's own reaction.
create or replace function public.reaction_counts(p_type text, p_ids uuid[])
returns table (target_id uuid, n bigint, top text[], mine text, comments bigint)
language sql stable security definer set search_path = public as $$
  select t.id,
         (select count(*) from reactions r where r.target_type = p_type and r.target_id = t.id),
         array(select r.emoji from reactions r where r.target_type = p_type and r.target_id = t.id
                group by r.emoji order by count(*) desc limit 3),
         (select r.emoji from reactions r where r.target_type = p_type and r.target_id = t.id and r.user_id = auth.uid()),
         (select count(*) from comments c where c.target_type = p_type and c.target_id = t.id)
    from unnest(p_ids) as t(id)
   where target_owner(p_type, t.id) is not null
$$;

-- ─────────────────────────────────────────────────────────────
-- "What's my vibe?" answers
-- ─────────────────────────────────────────────────────────────
create table public.vibe_answers (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  prompt     smallint not null check (prompt between 0 and 3),
  body       text not null check (char_length(btrim(body)) between 1 and 60),
  status     text not null default 'pending' check (status in ('pending','shown','hidden')),
  created_at timestamptz not null default now(),
  unique (subject_id, author_id, prompt),
  check (subject_id <> author_id)
);
create index vibe_answers_subject on public.vibe_answers (subject_id, status, created_at desc);
alter table public.vibe_answers enable row level security;
create policy "Shown vibes are public; others visible to the two people" on public.vibe_answers for select
  using (status = 'shown' or auth.uid() in (subject_id, author_id));
create policy "Answer as yourself" on public.vibe_answers for insert with check (author_id = auth.uid());
create policy "Either person can delete an answer" on public.vibe_answers for delete using (auth.uid() in (subject_id, author_id));

create or replace function public.before_vibe_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := 'pending'; new.created_at := now(); new.body := btrim(new.body);
  if (select standing from profiles where id = new.author_id) is distinct from 'good'
     or (select standing from profiles where id = new.subject_id) is distinct from 'good'
     or is_blocked(new.subject_id, new.author_id) or is_blocked(new.author_id, new.subject_id) then
    raise exception 'You can''t answer for this person' using errcode = '42501';
  end if;
  if (select count(*) from vibe_answers where author_id = new.author_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of vibes for one day. Try tomorrow.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger vibe_before_insert before insert on public.vibe_answers
  for each row execute function public.before_vibe_insert();

create or replace function public.after_vibe_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform touch_active(new.author_id);
  insert into notifications (user_id, type, actor_id, ref_id) values (new.subject_id, 'vibe', new.author_id, new.id);
  return new;
end $$;
create trigger vibe_after_insert after insert on public.vibe_answers
  for each row execute function public.after_vibe_insert();

create or replace function public.set_vibe_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('shown','hidden') then raise exception 'Invalid status'; end if;
  update vibe_answers set status = p_status where id = p_id and subject_id = auth.uid();
  if not found then raise exception 'Answer not found' using errcode = '42501'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Private feedback (the recipient sees who sent it; it never shows publicly)
-- ─────────────────────────────────────────────────────────────
create table public.private_notes (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 3 and 300),
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index private_notes_recipient on public.private_notes (recipient_id, created_at desc);
alter table public.private_notes enable row level security;
create policy "The two people can read a note" on public.private_notes for select using (auth.uid() in (sender_id, recipient_id));
create policy "Send notes as yourself"         on public.private_notes for insert with check (sender_id = auth.uid());
create policy "Recipient can delete a note"    on public.private_notes for delete using (recipient_id = auth.uid());

create or replace function public.before_note_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now(); new.body := btrim(new.body);
  if (select standing from profiles where id = new.sender_id) is distinct from 'good'
     or is_blocked(new.recipient_id, new.sender_id) or is_blocked(new.sender_id, new.recipient_id) then
    raise exception 'You can''t send feedback to this person' using errcode = '42501';
  end if;
  if exists (select 1 from private_notes where sender_id = new.sender_id and recipient_id = new.recipient_id
               and created_at > now() - interval '7 days') then
    raise exception 'You already sent them feedback this week' using errcode = '42501';
  end if;
  if (select count(*) from private_notes where sender_id = new.sender_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'That''s enough feedback for today' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger notes_before_insert before insert on public.private_notes
  for each row execute function public.before_note_insert();

create or replace function public.after_note_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, actor_id, ref_id) values (new.recipient_id, 'private_note', new.sender_id, new.id);
  return new;
end $$;
create trigger notes_after_insert after insert on public.private_notes
  for each row execute function public.after_note_insert();

-- ─────────────────────────────────────────────────────────────
-- Profile views (counts only — names are never exposed)
-- ─────────────────────────────────────────────────────────────
create table public.profile_views (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_id uuid not null references public.profiles(id) on delete cascade,
  day       date not null default current_date,
  primary key (viewed_id, day, viewer_id)
);
alter table public.profile_views enable row level security;   -- definer functions only

create or replace function public.record_profile_view(p_user uuid) returns void
language sql security definer set search_path = public as $$
  insert into profile_views (viewer_id, viewed_id)
  select auth.uid(), p_user
   where auth.uid() is not null and auth.uid() <> p_user
     and exists (select 1 from profiles where id = auth.uid())
     and exists (select 1 from profiles where id = p_user)
  on conflict do nothing
$$;

create or replace function public.my_profile_views(days int default 7) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct viewer_id)::int from profile_views
   where viewed_id = auth.uid() and day > current_date - least(greatest(days, 1), 90)
$$;

-- Keep "last active" fresh when people do things.
create or replace function public.after_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform touch_active(coalesce(to_jsonb(new) ->> 'giver_id', to_jsonb(new) ->> 'author_id')::uuid);
  return new;
end $$;
create trigger props_touch_active   after insert on public.props   for each row execute function public.after_activity();
create trigger vouches_touch_active after insert on public.vouches for each row execute function public.after_activity();

-- ─────────────────────────────────────────────────────────────
-- Trust score
-- ─────────────────────────────────────────────────────────────
create or replace function public.trust_breakdown(p_user uuid)
returns table (key text, label text, points int, detail text)
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles; vp numeric := 0; nv int; circles int; months int; rec record;
  wd int; nope int; scam boolean; quiet int;
begin
  select * into p from profiles where id = p_user;
  if not found then return; end if;

  -- Vouches: each worth up to 9, weighted by the voucher's track record and whether anyone vouches for them,
  -- halved when older than a year, halved for family.
  select count(*), coalesce(sum(
           9 * coalesce((select weight from track_record(v.author_id)), 1)
             * case when exists (select 1 from vouches w where w.subject_id = v.author_id and w.status = 'approved') then 1 else 0.6 end
             * case when coalesce(v.approved_at, v.created_at) < now() - interval '365 days' then 0.5 else 1 end
             * case when v.relationship = 'Family' then 0.5 else 1 end), 0)
    into nv, vp
    from vouches v join profiles a on a.id = v.author_id and a.standing = 'good'
   where v.subject_id = p_user and v.status = 'approved';
  if nv > 0 then
    key := 'vouches'; label := nv || case when nv = 1 then ' vouch' else ' vouches' end;
    points := round(least(50, vp)); detail := 'Weighted by how trusted each voucher is. Older than a year counts half.';
    return next;
  end if;

  select count(distinct relationship) into circles from vouches
   where subject_id = p_user and status = 'approved' and relationship <> 'Family';
  if circles > 0 then
    key := 'circles'; label := circles || case when circles = 1 then ' part of your life' else ' parts of your life' end;
    points := least(12, circles * 4); detail := 'Friends, coworkers, neighbors… variety is harder to fake.'; return next;
  end if;

  if p.id_verified then key := 'verified'; label := 'ID verified'; points := 12; detail := null; return next;
  elsif p.phone_verified then key := 'verified'; label := 'Phone verified'; points := 6; detail := null; return next;
  end if;

  months := floor(extract(epoch from now() - p.created_at) / (30 * 86400));
  if months > 0 then
    key := 'tenure'; label := months || case when months = 1 then ' month on Vouched' else ' months on Vouched' end;
    points := least(10, months); detail := null; return next;
  end if;

  select * into rec from track_record(p_user);
  if rec.backed >= 3 and rec.removed = 0 then
    key := 'record'; label := 'Good track record'; points := 5; detail := 'Everyone you backed is in good standing.'; return next;
  elsif rec.removed > 0 then
    key := 'record'; label := rec.removed || case when rec.removed = 1 then ' person you backed was removed' else ' people you backed were removed' end;
    points := -15 * rec.removed; detail := 'Removed for scams or fake accounts.'; return next;
  end if;

  select count(*) into wd from vouch_withdrawals where subject_id = p_user and created_at > now() - interval '365 days';
  if wd > 0 then
    key := 'withdrawn'; label := wd || case when wd = 1 then ' vouch withdrawn' else ' vouches withdrawn' end;
    points := -8 * wd; detail := 'Someone took their name off you this year.'; return next;
  end if;

  select count(*) into nope from vouch_checkins where subject_id = p_user and not yes and created_at > now() - interval '365 days';
  if nope > 0 then
    key := 'vouch_again'; label := '“Wouldn’t vouch again” (private)'; points := -4 * nope;
    detail := 'Private check-ins from people who vouched for you.'; return next;
  end if;

  select exists (select 1 from reports where profile_id = p_user and status = 'actioned' and reason in ('scam','fake')) into scam;
  if scam then key := 'reports'; label := 'Confirmed scam or fake-account report'; points := -30; detail := null; return next; end if;

  quiet := floor(extract(epoch from now() - p.last_active_at) / 86400);
  if quiet >= 90 then
    key := 'quiet'; label := 'Quiet for 3+ months'; points := -10; detail := 'Play polls, vouch or send gifts to stay active.'; return next;
  elsif quiet >= 30 then
    key := 'quiet'; label := 'Quiet for a month'; points := -5; detail := 'Play polls, vouch or send gifts to stay active.'; return next;
  end if;
end $$;
revoke all on function public.trust_breakdown(uuid) from public, anon, authenticated;

create or replace function public.tier_name(score int) returns text
language sql immutable as $$
  select case when score >= 75 then 'Highly trusted' when score >= 50 then 'Trusted' when score >= 25 then 'Known' else 'New' end
$$;

create or replace function public.trust_score_of(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, least(100, coalesce(sum(points), 0)))::int from trust_breakdown(p_user)
$$;
revoke all on function public.trust_score_of(uuid) from public, anon, authenticated;

-- Your own score, with every plus and minus.
create or replace function public.my_trust()
returns table (score int, tier text, next_tier text, points_to_next int, factors jsonb)
language sql stable security definer set search_path = public as $$
  with b as (select * from trust_breakdown(auth.uid())),
  s as (select greatest(0, least(100, coalesce(sum(points), 0)))::int as score from b)
  select s.score, tier_name(s.score),
         case when s.score >= 75 then null else tier_name(case when s.score < 25 then 25 when s.score < 50 then 50 else 75 end) end,
         case when s.score >= 75 then null when s.score < 25 then 25 - s.score when s.score < 50 then 50 - s.score else 75 - s.score end,
         coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'points', points, 'detail', detail) order by points desc) from b), '[]'::jsonb)
    from s
   where auth.uid() is not null
$$;

-- Everyone else only ever sees the tier.
create or replace function public.trust_tier(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select tier_name(trust_score_of(p_user)) where exists (select 1 from profiles where id = p_user and standing = 'good')
$$;
create or replace function public.trust_tiers(p_ids uuid[]) returns table (id uuid, tier text)
language sql stable security definer set search_path = public as $$
  select p.id, tier_name(trust_score_of(p.id)) from profiles p
   where p.id = any(p_ids[1:100]) and p.standing = 'good'
$$;

-- ─────────────────────────────────────────────────────────────
-- Push: new kinds, and calm mode (max N pushes a day, no pushes for reactions)
-- ─────────────────────────────────────────────────────────────
create or replace function public.push_message(n notifications)
returns table (title text, body text, url text)
language sql stable security definer set search_path = public as $$
  select
    case n.type when 'props' then 'Someone picked you' when 'new_vouch' then 'New vouch' when 'gift' then 'You got a gift' else 'Vouched' end,
    case n.type
      when 'props'          then 'Someone picked you for “' || coalesce((select label from prompts where id = n.prompt_id), 'a poll') || '”'
      when 'new_vouch'      then coalesce(a.display_name, 'Someone') || ' put their name on you. Review it to add it to your page.'
      when 'vouch_approved' then coalesce(a.display_name, 'Someone') || ' added your vouch to their page.'
      when 'new_follower'   then coalesce(a.display_name, 'Someone') || ' started following you.'
      when 'cosign'         then coalesce(a.display_name, 'Someone') || ' co-signed a vouch you’re part of.'
      when 'vouch_reply'    then coalesce(a.display_name, 'Someone') || ' replied to your vouch.'
      when 'rec_answer'     then coalesce(a.display_name, 'Someone') || ' answered your ask.'
      when 'rec_for_you'    then coalesce(a.display_name, 'Someone') || ' recommended you to someone.'
      when 'vouch_request'  then coalesce(a.display_name, 'Someone') || ' asked you for a vouch.'
      when 'invite_joined'  then coalesce(a.display_name, 'Someone') || ' joined with your invite.'
      when 'gift'           then coalesce(a.display_name, 'Someone') || ' sent you ' || coalesce(n.meta ->> 'emoji', '🎁') || ' ' || coalesce(n.meta ->> 'label', 'a gift')
      when 'reaction'       then coalesce(a.display_name, 'Someone') || ' reacted ' || coalesce(n.meta ->> 'emoji', '') || ' to your post'
      when 'comment'        then coalesce(a.display_name, 'Someone') || ' commented: ' || coalesce(n.meta ->> 'text', '')
      when 'vibe'           then coalesce(a.display_name, 'Someone') || ' answered “What’s my vibe?”'
      when 'private_note'   then coalesce(a.display_name, 'Someone') || ' sent you private feedback'
      else 'You have new activity.'
    end,
    case
      when n.request_id is not null then '/requests/' || n.request_id
      when n.type in ('new_follower', 'invite_joined') and a.username is not null then '/' || a.username
      when n.type = 'props' then '/activity'
      else '/inbox'
    end
  from (select 1) x left join profiles a on a.id = n.actor_id
$$;
revoke all on function public.push_message(notifications) from public, anon, authenticated;

create or replace function public.after_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare msgs jsonb; m record;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return new; end if;
  if wants(new.user_id, 'calm_notifications') then
    if new.type = 'reaction' then return new; end if;
    if (select count(*) from notifications where user_id = new.user_id and type <> 'reaction'
          and created_at > now() - interval '24 hours') > config_int('daily_push_cap', 5) then
      return new;
    end if;
  end if;
  select * into m from push_message(new);
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', m.title, 'body', m.body, 'sound', 'default',
                                      'data', jsonb_build_object('url', m.url)))
    into msgs from push_tokens t where t.user_id = new.user_id;
  if msgs is null then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', msgs, '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb;
  return new;
exception when others then
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────
revoke all on function public.today_drop()                     from public, anon;
revoke all on function public.my_streak()                      from public, anon;
revoke all on function public.my_week()                        from public, anon;
revoke all on function public.feed_results(int)                from public, anon;
revoke all on function public.withdraw_vouch(uuid)             from public, anon;
revoke all on function public.answer_vouch_again(uuid, boolean) from public, anon;
revoke all on function public.vouch_again_due()                from public, anon;
revoke all on function public.gifts_left_today()               from public, anon;
revoke all on function public.set_vibe_status(uuid, text)      from public, anon;
revoke all on function public.record_profile_view(uuid)        from public, anon;
revoke all on function public.my_profile_views(int)            from public, anon;
revoke all on function public.my_trust()                       from public, anon;
grant execute on function public.today_drop(), public.my_streak(), public.my_week(), public.feed_results(int),
  public.withdraw_vouch(uuid), public.answer_vouch_again(uuid, boolean), public.vouch_again_due(),
  public.gifts_left_today(), public.set_vibe_status(uuid, text), public.record_profile_view(uuid),
  public.my_profile_views(int), public.my_trust() to authenticated;
-- Public (logged-out profile pages): tiers, personality, titles, reaction counts.
grant execute on function public.trust_tier(uuid), public.trust_tiers(uuid[]), public.personality(uuid),
  public.props_summary(uuid), public.reaction_counts(text, uuid[]), public.today_prompts(date), public.target_owner(text, uuid)
  to anon, authenticated;

insert into public.reserved_usernames (username) values ('vibe'),('score'),('activity'),('gifts'),('polls'),('explore')
on conflict do nothing;


-- Let the first members (you) sign up without an invite. Turn it back on later with:
--   update app_config set value = 'on' where key = 'invite_only';
update app_config set value = 'off' where key = 'invite_only';
