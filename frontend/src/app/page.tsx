import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRoleHomePath } from '@/lib/roles';

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  const destination = getRoleHomePath(session.user.role);
  redirect(destination);
}
