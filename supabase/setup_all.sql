-- Vouched: full database setup in one paste.
-- Supabase → SQL Editor → New query → paste all of this → Run.
-- (Same as running supabase/migrations/0001 … 0006 in order.)


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


-- Let the first members (you) sign up without an invite. Turn it back on later with:
--   update app_config set value = 'on' where key = 'invite_only';
update app_config set value = 'off' where key = 'invite_only';
