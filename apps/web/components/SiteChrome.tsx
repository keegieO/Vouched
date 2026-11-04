import Link from 'next/link';
import { Logo } from './ui';

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="site-header">
      <div className="container">
        <Logo />
        <nav className="site-nav">
          <Link className="text" href="/#how">How it works</Link>
          <Link className="text" href="/safety">Safety</Link>
          {signedIn ? (
            <Link className="btn primary sm" href="/feed">Open app</Link>
          ) : (
            <>
              <Link className="text" href="/login">Log in</Link>
              <Link className="btn primary sm" href="/login?mode=signup">Get vouched</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container stack">
        <nav>
          <Link href="/#how">How it works</Link>
          <Link href="/safety">Safety & rules</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/login">Log in</Link>
        </nav>
        <p className="hint">© {new Date().getFullYear()} Vouched. Made in Indiana.</p>
      </div>
    </footer>
  );
}
