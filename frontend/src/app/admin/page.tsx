import { redirect } from 'next/navigation';

/**
 * `/admin` is linked from the dashboard profile menu but only the child routes
 * (`/admin/users`, `/admin/roles`, …) exist — without this route the link 404s.
 * The middleware still enforces the SUPER_ADMIN/ADMIN role before this runs.
 */
export default function AdminIndexPage() {
  redirect('/admin/users');
}
