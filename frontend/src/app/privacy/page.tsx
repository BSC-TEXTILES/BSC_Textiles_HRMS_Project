'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Download, LogOut, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { signOut } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Select, Textarea } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function message(err: any, fallback: string): string {
  return err?.response?.data?.message || err?.response?.data?.error || fallback;
}

export default function MyPrivacyPage() {
  const [consent, setConsent] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [type, setType] = useState('ERASURE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmType, setConfirmType] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [consentResponse, requestsResponse] = await Promise.all([
      api.get('/session/consent'),
      api.get('/privacy/me/requests'),
    ]);
    setConsent(consentResponse.data);
    setRequests(requestsResponse.data.requests || []);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const saveConsent = async (patch: { analytics?: boolean; preferences?: boolean }) => {
    try {
      const { data } = await api.post('/session/consent', patch);
      setConsent(data);
      toast.success('Consent updated');
    } catch (err: any) {
      toast.error(message(err, 'Could not save your choice'));
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/privacy/me/export', { timeout: 60000 });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'my-hrms-data.json';
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
      load();
    } catch (err: any) {
      toast.error(message(err, 'Could not prepare your export'));
    } finally {
      setBusy(false);
    }
  };

  const raiseRequest = async () => {
    setBusy(true);
    try {
      await api.post('/privacy/me/requests', { type, note: note || undefined });
      toast.success('Request logged. HR will verify your identity before acting.');
      setNote('');
      setConfirmType(null);
      await load();
    } catch (err: any) {
      toast.error(message(err, 'Could not raise the request'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">My privacy</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Your consent, a copy of what the system holds about you, and the right-to-erasure workflow.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Cookie consent</h2>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Necessary cookies are always on — they carry your session and the CSRF token.
              </p>
              <label className="flex items-center gap-2 text-gray-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
                  checked={Boolean(consent?.analytics)}
                  onChange={(event) => saveConsent({ analytics: event.target.checked })}
                />
                Analytics (aggregate page usage)
              </label>
              <label className="flex items-center gap-2 text-gray-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
                  checked={Boolean(consent?.preferences)}
                  onChange={(event) => saveConsent({ preferences: event.target.checked })}
                />
                Preferences (sidebar, hub, theme)
              </label>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Recorded against policy version {consent?.version ?? '—'}. Changing a checkbox writes a new dated
                record.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Your data</h2>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Button variant="outline" size="sm" onClick={exportData} loading={busy} className="w-full">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download everything we hold about me
              </Button>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Includes your profile, attendance, leave, payroll lines, documents, sessions, sign-in attempts, consent
                records and the audit entries naming you.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    options={[
                      { value: 'ERASURE', label: 'Erase my personal data' },
                      { value: 'RESTRICTION', label: 'Restrict processing' },
                      { value: 'CORRECTION', label: 'Correct my data' },
                    ]}
                  />
                </div>
              </div>
              <Textarea
                label="Note for HR (optional)"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything that helps us action this correctly."
              />
              <Button size="sm" onClick={() => setConfirmType(type)} className="w-full">
                Raise request
              </Button>
              {type === 'ERASURE' && (
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Erasure masks your identity. Statutory payroll and attendance rows are kept as required by law — see
                  the Data Retention Policy.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card padding={false}>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">My requests</h2>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Raised</th>
                  <th className="px-4 py-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-2">{request.type}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          request.status === 'COMPLETED'
                            ? 'success'
                            : request.status === 'REJECTED'
                              ? 'danger'
                              : request.status === 'IN_REVIEW'
                                ? 'info'
                                : 'warning'
                        }
                      >
                        {request.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">{new Date(request.requestedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-xs">{request.completedAt ? new Date(request.completedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
                      No requests raised yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Sessions and account</h2>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/change-password">
              <Button variant="outline" size="sm">
                Change my password
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api.post('/session/logout', {}).catch(() => undefined);
                await signOut({ callbackUrl: '/login' });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out of this device
            </Button>
          </CardContent>
        </Card>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          Read the <Link href="/privacy-policy" className="underline">Privacy Policy</Link>,{' '}
          <Link href="/cookie-policy" className="underline">Cookie Policy</Link>,{' '}
          <Link href="/data-retention" className="underline">Data Retention Policy</Link> and{' '}
          <Link href="/terms-of-use" className="underline">Terms of Use</Link>.
        </p>

        <ConfirmDialog
          open={Boolean(confirmType)}
          title={`Raise a ${confirmType?.toLowerCase()} request?`}
          tone={confirmType === 'ERASURE' ? 'danger' : 'primary'}
          confirmLabel="Raise request"
          loading={busy}
          message={
            confirmType === 'ERASURE'
              ? 'HR will verify your identity, then mask your personal identifiers. Statutory records are retained but can no longer be attributed to you. This cannot be undone from this screen.'
              : 'The request is queued for HR review; nothing changes until they act on it.'
          }
          onConfirm={raiseRequest}
          onCancel={() => setConfirmType(null)}
        />
      </div>
    </DashboardLayout>
  );
}
