'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function DeleteMine({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button className="btn sm ghost" onClick={() => setConfirm(true)}>Delete</button>;
  return (
    <>
      <button className="btn sm danger" onClick={async () => { await createClient().from('vouches').delete().eq('id', id); router.refresh(); }}>
        Yes, delete it
      </button>
      <button className="btn sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
    </>
  );
}
