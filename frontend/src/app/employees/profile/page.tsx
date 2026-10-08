'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import api from '@/lib/api';

export default function ProfileRedirectPage() {
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    async function redirect() {
      if (session?.user?.employeeId) {
        router.replace(`/employees/profile/${session.user.employeeId}`);
        return;
      }
      try {
        const res = await api.get('/employees?limit=1');
        const first = res.data.employees?.[0];
        if (first?.id) {
          router.replace(`/employees/profile/${first.id}`);
        } else {
          router.replace('/employees');
        }
      } catch {
        router.replace('/employees');
      }
    }
    redirect();
  }, [session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent mx-auto"></div>
        <p className="mt-3 text-sm text-gray-500">Loading Employee Dossier...</p>
      </div>
    </div>
  );
}
