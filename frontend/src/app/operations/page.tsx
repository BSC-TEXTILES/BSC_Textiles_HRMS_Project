import { redirect } from 'next/navigation';

/**
 * Root `/operations` route redirects to live attendance
 * to prevent 404s when users navigate directly to `/operations`.
 */
export default function OperationsIndexPage() {
  redirect('/operations/live-attendance');
}
