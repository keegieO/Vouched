import { Logo } from '@/components/ui';
import { CodeForm } from './CodeForm';

export const metadata = { title: 'Join with an invite' };

export default function Join() {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1 style={{ fontSize: 38 }}>Got an invite code?</h1>
        <p className="muted">Every member is vouched in by someone who already belongs. Enter the code from your text.</p>
        <CodeForm />
      </div>
    </main>
  );
}
