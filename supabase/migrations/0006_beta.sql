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
