import Link from 'next/link';
import { Logo } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1 style={{ fontSize: 34 }}>No one here</h1>
        <p className="muted">That profile doesn’t exist, or the username changed. Check the link and try again.</p>
        <Link className="btn primary" href="/">Go to Vouched</Link>
      </div>
    </main>
  );
}
