import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { normalizeUsername, type Profile, type Vouch } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Avatar, Logo, themeStyle } from '@/components/ui';
import { VouchForm } from './VouchForm';

export const metadata = { title: 'Write a vouch' };

export default async function WriteVouch({ params }: { params: { username: string } }) {
  const { supabase, user, profile: me } = await getViewer();
  const path = `/${params.username}/vouch`;
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!me) redirect(`/onboarding?next=${encodeURIComponent(path)}`);

  const { data } = await supabase.from('profiles').select('*').eq('username', normalizeUsername(params.username)).maybeSingle();
  const subject = data as Profile | null;
  if (!subject) notFound();
  const first = subject.display_name.split(' ')[0];

  const { data: existing } = await supabase.from('vouches').select('*').eq('subject_id', subject.id).eq('author_id', user.id).maybeSingle();

  let blocker: string | null = null;
  if (subject.id === user.id) blocker = 'You can’t vouch for yourself. That’s the whole idea. Send your link to someone who knows you.';
  else if (!subject.open_to_vouches && !existing) blocker = `${first} isn’t taking new vouches right now.`;

  return (
    <div className="themed" style={themeStyle(subject.theme)}>
      <main className="auth-wrap" style={{ alignItems: 'start' }}>
        <div className="auth-card" style={{ maxWidth: 560 }}>
          <Logo />
          <div className="who">
            <Avatar name={subject.display_name} url={subject.avatar_url} size={64} />
            <div className="stack" style={{ gap: 2 }}>
              <span className="label">{existing ? 'Editing your vouch for' : 'You’re vouching for'}</span>
              <h2>{subject.display_name}</h2>
            </div>
          </div>
          {blocker ? (
            <>
              <p className="banner">{blocker}</p>
              <Link className="btn primary" href={subject.id === user.id ? '/ask' : `/${subject.username}`}>
                {subject.id === user.id ? 'Ask for vouches' : `Back to ${first}’s profile`}
              </Link>
            </>
          ) : (
            <VouchForm subjectId={subject.id} subjectUsername={subject.username} firstName={first} authorId={user.id}
              authorName={me.display_name} existing={(existing as Vouch | null) ?? null} />
          )}
        </div>
      </main>
    </div>
  );
}
