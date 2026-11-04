import { Screen } from '@/components/Screen';
import { FeedbackForm } from './FeedbackForm';

export const metadata = { title: 'Send feedback' };

export default function Feedback({ searchParams }: { searchParams: { from?: string } }) {
  return (
    <Screen title="Send feedback" back="/settings">
      <p className="muted">You’re one of the first people on Vouched. Tell us what broke, what confused you, or what you wish it did. We read every one.</p>
      <FeedbackForm from={searchParams.from ?? null} />
    </Screen>
  );
}
