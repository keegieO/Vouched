import { Quota } from '@/components/trust';
import Link from 'next/link';
import { APP_VERSION, MONTHLY_VOUCHES, STYLES, isStyle, monthResetLabel } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { LogoutRow } from './SettingsForms';
import { ProfileToggle } from '@/components/v2';

export const metadata = { title: 'Settings' };

function Row({ href, icon, label, value, danger }: { href: string; icon: string; label: string; value?: string | number; danger?: boolean }) {
  return (
    <Link className={`li ${danger ? 'danger' : ''}`} href={href}>
      <span className="ico"><Icon name={icon} size="sm" /></span>
      <span className="grow">{label}</span>
      {value !== undefined && value !== '' && <span className="val">{value}</span>}
      <Icon name="chev" size="sm" />
    </Link>
  );
}

export default async function Settings() {
  const { supabase, user, profile } = await getViewer();
  if (!user || !profile) return null;
  const [{ count: links }, { count: blocked }] = await Promise.all([
    supabase.from('profile_links').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id),
    supabase.from('blocks').select('blocked_id', { count: 'exact', head: true }).eq('blocker_id', profile.id),
  ]);
  const [{ data: vLeft }, { data: iLeft }, { data: admin }, { data: us }, { data: tier }] = await Promise.all([
    supabase.rpc('vouches_left'), supabase.rpc('invites_left'), supabase.rpc('is_admin'),
    supabase.from('user_settings').select('calm_notifications').eq('user_id', profile.id).maybeSingle(),
    supabase.rpc('trust_tier', { p_user: profile.id }),
  ]);
  const who = { everyone: 'Everyone', following: 'People I follow', nobody: 'Paused' }[profile.who_can_vouch ?? 'everyone'];

  return (
    <Screen title="Settings" back={`/${profile.username}`}>
      <Quota left={(vLeft as number | null) ?? 0} total={MONTHLY_VOUCHES} title={`${(vLeft as number | null) ?? 0} vouches · ${(iLeft as number | null) ?? 0} invites left`}
        hint={`Vouches reset ${monthResetLabel()}.`} action={<Link className="btn sm soft" href="/how">How it works</Link>} />
      <span className="label list-head">You</span>
      <section className="list">
        <Row href="/score" icon="shield" label="Trust score" value={(tier as string | null) ?? ''} />
        <Row href="/vibe" icon="sparkle" label="What’s my vibe? link" />
        <ProfileToggle userId={profile.id} field="work_mode" on={!!profile.work_mode} label="Work mode" hint="Adds a “Hire me” tab to your profile with your skills and status" />
      </section>
      <span className="label list-head">Account</span>
      <section className="list">
        <Row href="/settings/profile" icon="edit" label="Edit profile" />
        <Row href="/invite" icon="ticket" label="Invites" value={`${(iLeft as number | null) ?? 0} left`} />
        <Row href="/settings/profile#links" icon="link" label="Linked accounts" value={`${links ?? 0} linked`} />
        <Row href="/settings/account" icon="phone" label="Phone verification" value={profile.phone_verified ? 'Verified' : 'Not verified'} />
        <Row href="/settings/account" icon="mail" label="Email & password" value={user.email ?? ''} />
      </section>
      <span className="label list-head">Privacy</span>
      <section className="list">
        <Row href="/settings/privacy" icon="shield" label="Who can vouch for me" value={who} />
        <Row href="/settings/privacy" icon="eye" label="Profile & discovery" />
        <Row href="/settings/blocked" icon="ban" label="Blocked people" value={blocked || ''} />
      </section>
      <span className="label list-head">Preferences</span>
      <section className="list">
        <Row href="/settings/notifications" icon="bell" label="Notifications" />
        <ProfileToggle userId={profile.id} table="user_settings" field="calm_notifications" on={(us as { calm_notifications?: boolean } | null)?.calm_notifications ?? true} label="Calm notifications" hint="At most 5 pushes a day, and none for reactions" />
        <Row href="/settings/appearance" icon="moon" label="Appearance" />
        <Row href="/settings/profile#look" icon="palette" label="Page style & color" value={STYLES[isStyle(profile.style) ? profile.style : 'signed'].name} />
      </section>
      <span className="label list-head">Support</span>
      <section className="list">
        <Row href="/feedback?from=settings" icon="msg" label="Send feedback" value="Beta" />
        {admin ? <Row href="/admin" icon="shield" label="Admin" /> : null}
        <Row href="/how" icon="help" label="How Vouched works" />
        <Row href="/safety" icon="shield" label="Safety & rules" />
        <Row href="/terms" icon="doc" label="Terms" />
        <Row href="/privacy" icon="lock" label="Privacy policy" />
      </section>
      <section className="list">
        <LogoutRow />
        <Row href="/settings/account#delete" icon="trash" label="Delete account" danger />
      </section>
      <p className="hint" style={{ textAlign: 'center' }}>Vouched {APP_VERSION}</p>
    </Screen>
  );
}
