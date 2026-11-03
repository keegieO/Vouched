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
