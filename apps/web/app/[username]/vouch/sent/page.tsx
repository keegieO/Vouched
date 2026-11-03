import Link from 'next/link';
import { normalizeUsername } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { CheckMark, Logo } from '@/components/ui';
import { trustSummary } from '@vouched/shared';

export const metadata = { title: 'Vouch sent' };

export default async function Sent({ params, searchParams }: { params: { username: string }; searchParams: { edited?: string } }) {
  const { supabase, profile: me } = await getViewer();
  const { data: subject } = await supabase.from('profiles').select('display_name, username').eq('username', normalizeUsername(params.username)).maybeSingle();
  const first = (subject?.display_name ?? 'them').split(' ')[0];

  let myCount = 0;
  if (me) {
    const { data } = await supabase.from('vouches').select('relationship, traits').eq('subject_id', me.id).eq('status', 'approved');
    myCount = trustSummary((data ?? []) as never).total;
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center', alignItems: 'center' }}>
        <Logo />
        <div style={{ width: 88, height: 88, borderRadius: 28, background: 'var(--good-soft)', display: 'grid', placeItems: 'center' }}>
          <CheckMark size={44} color="var(--good)" width={2.6} />
        </div>
        <h1 style={{ fontSize: 34 }}>{searchParams.edited ? 'Vouch updated' : `Vouch sent to ${first}`}</h1>
        <p className="muted">{first} approves it before it shows on their profile.</p>

        <section className="panel" style={{ textAlign: 'left', width: '100%' }}>
          {myCount < 3 ? (
            <>
              <h3>Now get people to vouch for you</h3>
              <p className="muted small">You have {myCount} {myCount === 1 ? 'vouch' : 'vouches'}. {first} might return the favor. Send them your link.</p>
              <Link className="btn primary" href="/ask">Ask for vouches</Link>
            </>
          ) : (
            <>
              <h3>Know someone else who deserves one?</h3>
              <p className="muted small">Vouches mean the most from people who’ve seen someone at their best.</p>
              <Link className="btn primary" href="/home">Back to my profile</Link>
            </>
          )}
        </section>
        {subject && <Link className="small" href={`/${subject.username}`}>See {first}’s profile</Link>}
      </div>
    </main>
  );
}
