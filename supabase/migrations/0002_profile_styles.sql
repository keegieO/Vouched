-- Profile styles: how someone's public page looks (on top of their profile color).
alter table public.profiles
  add column if not exists style text not null default 'signed'
  check (style in ('signed','pop','night','badge'));
