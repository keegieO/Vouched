import { PeopleList } from '@/components/PeopleList';
export const metadata = { title: 'Followers' };
export default function Followers({ params }: { params: { username: string } }) {
  return <PeopleList username={params.username} which="followers" />;
}
