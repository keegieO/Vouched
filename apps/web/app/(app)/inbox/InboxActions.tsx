'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/client';

export function VouchActions({ vouchId, authorId, mode }: { vouchId: string; authorId: string; mode: 'pending' | 'hidden' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [toast, show] = useToast();

  async function run(fn: () => PromiseLike<{ error: { message: string; code?: string } | null }>, done: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return show(error.message);
    show(done);
    router.refresh();
  }
  const supabase = createClient();
  const setStatus = (s: 'approved' | 'hidden') => () => supabase.rpc('set_vouch_status', { p_vouch_id: vouchId, p_status: s });

  async function blockAndHide() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await run(async () => {
      const b = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: authorId });
      if (b.error && b.error.code !== '23505') return b;
      return supabase.rpc('set_vouch_status', { p_vouch_id: vouchId, p_status: 'hidden' });
    }, 'Blocked. They can’t vouch for you again.');
    setConfirmBlock(false);
  }

  return (
    <>
      {toast}
      {confirmBlock ? (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small">Block this person? They won’t be able to vouch for you, and this vouch will be hidden.</p>
          <div className="row">
            <button className="btn sm danger" disabled={busy} onClick={blockAndHide}>Block</button>
            <button className="btn sm ghost" onClick={() => setConfirmBlock(false)}>Cancel</button>
          </div>
        </div>
      ) : mode === 'pending' ? (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn sm primary" style={{ flex: 1 }} disabled={busy} onClick={() => run(setStatus('approved'), 'Added to your profile')}>Add to profile</button>
          <button className="btn sm ghost" style={{ flex: 1 }} disabled={busy} onClick={() => run(setStatus('hidden'), 'Kept hidden. Only you can see it.')}>Keep hidden</button>
          <button className="btn sm ghost" disabled={busy} onClick={() => setConfirmBlock(true)}>Block</button>
        </div>
      ) : (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn sm primary" style={{ flex: 1 }} disabled={busy} onClick={() => run(setStatus('approved'), 'Added to your profile')}>Add to profile</button>
          <button className="btn sm danger" style={{ flex: 1 }} disabled={busy}
            onClick={() => run(() => supabase.from('vouches').delete().eq('id', vouchId), 'Deleted')}>Delete</button>
        </div>
      )}
    </>
  );
}

export function MarkRead({ userId, hasUnread }: { userId: string; hasUnread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasUnread) return;
    const t = setTimeout(async () => {
      await createClient().from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
      router.refresh();
    }, 1500);
    return () => clearTimeout(t);
  }, [hasUnread, userId, router]);
  return null;
}
