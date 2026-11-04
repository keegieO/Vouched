'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="grab" />
        {title && (
          <div className="row between nowrap">
            <h2>{title}</h2>
            <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Sticky top bar for app screens. */
export function PageHeader({ title, back = false, actions }: { title?: string; back?: boolean | string; actions?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="topbar">
      {back && (
        <button type="button" className="iconbtn" aria-label="Back"
          onClick={() => (typeof back === 'string' ? router.push(back) : window.history.length > 1 ? router.back() : router.push('/feed'))}>
          <Icon name="back" />
        </button>
      )}
      <span className="title">{title}</span>
      {actions}
    </header>
  );
}
