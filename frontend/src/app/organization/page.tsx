import { redirect } from 'next/navigation';

/**
 * Root `/organization` route redirects to departments and units
 * to prevent 404s when users navigate directly to `/organization`.
 */
export default function OrganizationIndexPage() {
  redirect('/organization/departments');
}
