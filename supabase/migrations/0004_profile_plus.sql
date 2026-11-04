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
