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
