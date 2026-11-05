-- Vouched upgrade: trust score, daily polls, gifts, reactions, comments, vibes, private feedback.
-- You already ran setup_all.sql before? Paste ONLY this file into Supabase → SQL Editor → Run. (Run it once.)

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
    ('Kind','Kind'),('Generous','Kind'),('Great listener','Kind'),('Calm in a crisis','Smart'),('Skilled','Smart'),
    ('Good with kids','Kind'),('Respectful','Kind'),('Fair price','Reliable'),('Clean','Reliable')),
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
