import { redirect } from 'next/navigation';

/**
 * Root `/incentives` route redirects to calculation
 * to prevent 404s when users navigate directly to `/incentives`.
 */
export default function IncentivesIndexPage() {
  redirect('/incentives/calculation');
}
