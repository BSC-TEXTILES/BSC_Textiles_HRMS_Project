import { redirect } from 'next/navigation';

/**
 * Root `/attendance` route redirects to the primary register view
 * to prevent 404s when users navigate directly to `/attendance`.
 */
export default function AttendanceIndexPage() {
  redirect('/attendance/register');
}
