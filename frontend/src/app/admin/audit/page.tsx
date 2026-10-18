import { redirect } from 'next/navigation';

export default function AdminAuditRedirect() {
  redirect('/admin/audit-logs');
}
