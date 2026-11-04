import { PeopleList } from '@/components/PeopleList';
export const metadata = { title: 'Following' };
export default function Following({ params }: { params: { username: string } }) {
  return <PeopleList username={params.username} which="following" />;
}
