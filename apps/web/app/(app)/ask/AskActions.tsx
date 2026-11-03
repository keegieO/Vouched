'use client';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/client';

export function AskActions({ message, link }: { message: string; link: string }) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(!!navigator.share), []);
  return (
    <div className="row">
      <a className="btn primary" href={`sms:?&body=${encodeURIComponent(message)}`}>Open Messages</a>
      {canShare && (
        <button type="button" className="btn ghost" onClick={() => navigator.share({ text: message, url: link }).catch(() => {})}>
          Share another way
        </button>
      )}
      <CopyButton text={message} label="Copy text" done="Copied" className="btn ghost" />
    </div>
  );
}
