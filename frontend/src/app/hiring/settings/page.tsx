'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Database, Send, RefreshCw, ShieldCheck, Palette, Bell, Settings2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { canAction, useAccessSnapshot } from '@/lib/rbac';
import { HireError } from '@/components/hiring/HireError';
import { HiringOutboxStats, HiringSettingsBundle, HiringShardRow } from '@/lib/hiring';

function Toggle({ label, hint, checked, onChange, disabled }: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-100 p-3 dark:border-slate-800 ${disabled ? 'opacity-60' : ''}`}>
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
      />
    </label>
  );
}

export default function HiringSettingsPage() {
  const access = useAccessSnapshot();
  const canEdit = canAction(access, 'RECRUITMENT', 'edit');
  const isAdmin = access.unrestricted || access.roles.some((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r));

  const [settings, setSettings] = useState<HiringSettingsBundle | null>(null);
  const [shards, setShards] = useState<HiringShardRow[] | null>(null);
  const [outbox, setOutbox] = useState<HiringOutboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/hiring/settings');
      setSettings(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load hiring settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOps = useCallback(async () => {
    try {
      const shardsRes = await api.get('/hiring/shards').catch(() => null);
      if (shardsRes) setShards(Array.isArray(shardsRes.data) ? shardsRes.data : []);
    } catch {
      /* non-admin users simply don't see the section */
    }
    try {
      const outboxRes = await api.get('/hiring/outbox/stats').catch(() => null);
      if (outboxRes) setOutbox(outboxRes.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    loadOps();
  }, [load, loadOps]);

  const save = async <K extends keyof HiringSettingsBundle>(key: K) => {
    if (!settings) return;
    setSavingKey(key);
    try {
      const res = await api.patch(`/hiring/settings/${key}`, settings[key]);
      setSettings((prev) => (prev ? { ...prev, [key]: res.data } : prev));
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSavingKey(null);
    }
  };

  const provisionAll = async () => {
    if (!confirm('Provision/migrate hiring tables on every location shard?')) return;
    setProvisioning(true);
    try {
      await api.post('/hiring/shards/provision', {});
      toast.success('Shard provisioning complete');
      await loadOps();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Provisioning failed');
    } finally {
      setProvisioning(false);
    }
  };

  const requeueFailed = async () => {
    try {
      const res = await api.post('/hiring/outbox/requeue', {});
      toast.success(`${res.data?.requeued ?? 0} failed event(s) requeued`);
      await loadOps();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Requeue failed');
    }
  };

  if (loading && !settings) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="h-8 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !settings) {
    return (
      <DashboardLayout>
        <HireError message={error || 'Settings unavailable'} onRetry={load} />
      </DashboardLayout>
    );
  }

  const general = settings['hiring.general'];
  const branding = settings['hiring.branding'];
  const notifications = settings['hiring.notifications'];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hiring Settings</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Candidate form policy, consent text, branding and notification rules — applied to every location.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <ShieldCheck className="h-4 w-4" /> Submission policy
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Consent text shown to candidates</label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={general.consentText}
                  onChange={(e) => setSettings({ ...settings, 'hiring.general': { ...general, consentText: e.target.value } })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#1346a1] focus:outline-none focus:ring-1 focus:ring-[#1346a1] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Retention (days)"
                  type="number"
                  min={30}
                  disabled={!canEdit}
                  value={String(general.retentionDays)}
                  onChange={(e) => setSettings({ ...settings, 'hiring.general': { ...general, retentionDays: Number(e.target.value) || 0 } })}
                />
                <Input
                  label="Max submissions / phone / day"
                  type="number"
                  min={1}
                  disabled={!canEdit}
                  value={String(general.maxSubmissionsPerPhonePerDay)}
                  onChange={(e) => setSettings({ ...settings, 'hiring.general': { ...general, maxSubmissionsPerPhonePerDay: Number(e.target.value) || 1 } })}
                />
                <Input
                  label="Duplicate block (days)"
                  type="number"
                  min={0}
                  disabled={!canEdit}
                  value={String(general.autoRejectDuplicateWindowDays)}
                  onChange={(e) => setSettings({ ...settings, 'hiring.general': { ...general, autoRejectDuplicateWindowDays: Number(e.target.value) || 0 } })}
                />
              </div>
              <Toggle
                label="Require captcha on submissions"
                hint="Shows a self-hosted SVG challenge before the form can be submitted."
                checked={general.requireCaptcha}
                disabled={!canEdit}
                onChange={(v) => setSettings({ ...settings, 'hiring.general': { ...general, requireCaptcha: v } })}
              />
              <div className="flex justify-end">
                <Button size="sm" className="gap-1" disabled={!canEdit} loading={savingKey === 'hiring.general'} onClick={() => save('hiring.general')}>
                  <Save className="h-3.5 w-3.5" /> Save policy
                </Button>
              </div>
            </div>
          </Card>

          <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Palette className="h-4 w-4" /> Candidate-facing branding
            </h2>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Company name"
                  disabled={!canEdit}
                  value={branding.companyName}
                  onChange={(e) => setSettings({ ...settings, 'hiring.branding': { ...branding, companyName: e.target.value } })}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Primary colour</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      disabled={!canEdit}
                      value={branding.primaryColor || '#0f766e'}
                      onChange={(e) => setSettings({ ...settings, 'hiring.branding': { ...branding, primaryColor: e.target.value } })}
                      className="h-9 w-12 cursor-pointer rounded border border-gray-300 dark:border-slate-700"
                    />
                    <Input
                      disabled={!canEdit}
                      value={branding.primaryColor}
                      onChange={(e) => setSettings({ ...settings, 'hiring.branding': { ...branding, primaryColor: e.target.value } })}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Support email"
                  disabled={!canEdit}
                  value={branding.supportEmail}
                  onChange={(e) => setSettings({ ...settings, 'hiring.branding': { ...branding, supportEmail: e.target.value } })}
                />
                <Input
                  label="Support phone"
                  disabled={!canEdit}
                  value={branding.supportPhone}
                  onChange={(e) => setSettings({ ...settings, 'hiring.branding': { ...branding, supportPhone: e.target.value } })}
                />
              </div>
              <Input
                label="Privacy policy URL"
                placeholder="https://…"
                disabled={!canEdit}
                value={branding.privacyPolicyUrl}
                onChange={(e) => setSettings({ ...settings, 'hiring.branding': { ...branding, privacyPolicyUrl: e.target.value } })}
              />
              <div className="flex justify-end">
                <Button size="sm" className="gap-1" disabled={!canEdit} loading={savingKey === 'hiring.branding'} onClick={() => save('hiring.branding')}>
                  <Save className="h-3.5 w-3.5" /> Save branding
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Bell className="h-4 w-4" /> HR notifications
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Toggle
              label="New application alerts"
              hint="Notify the location's hiring team when a candidate applies."
              checked={notifications.notifyOnNewApplication}
              disabled={!canEdit}
              onChange={(v) => setSettings({ ...settings, 'hiring.notifications': { ...notifications, notifyOnNewApplication: v } })}
            />
            <Toggle
              label="Stage change alerts"
              hint="Notify when a candidate moves stage (normally off to reduce noise)."
              checked={notifications.notifyOnStageChange}
              disabled={!canEdit}
              onChange={(v) => setSettings({ ...settings, 'hiring.notifications': { ...notifications, notifyOnStageChange: v } })}
            />
            <Toggle
              label="Location team"
              hint="Include the location's configured hiring team as recipients."
              checked={notifications.notifyLocationTeam}
              disabled={!canEdit}
              onChange={(v) => setSettings({ ...settings, 'hiring.notifications': { ...notifications, notifyLocationTeam: v } })}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" className="gap-1" disabled={!canEdit} loading={savingKey === 'hiring.notifications'} onClick={() => save('hiring.notifications')}>
              <Save className="h-3.5 w-3.5" /> Save notifications
            </Button>
          </div>
        </Card>

        {(shards || outbox) && (
          <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Settings2 className="h-4 w-4" /> Operations
              </h2>
              <div className="flex items-center gap-2">
                {outbox && outbox.failed > 0 && (
                  <Button size="sm" variant="outline" className="gap-1 text-amber-700" onClick={requeueFailed}>
                    <Send className="h-3.5 w-3.5" /> Requeue {outbox.failed} failed
                  </Button>
                )}
                {isAdmin && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={provisionAll} loading={provisioning}>
                    <RefreshCw className="h-3.5 w-3.5" /> Provision shards
                  </Button>
                )}
              </div>
            </div>

            {outbox && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: 'Pending', value: outbox.pending, tone: 'text-amber-600' },
                  { label: 'Processing', value: outbox.processing, tone: 'text-sky-600' },
                  { label: 'Done', value: outbox.done, tone: 'text-emerald-600' },
                  { label: 'Failed', value: outbox.failed, tone: 'text-red-600' },
                  { label: 'Oldest pending', value: outbox.oldestPendingAt ? new Date(outbox.oldestPendingAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '—', tone: 'text-slate-600' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-100 p-3 text-center dark:border-slate-800">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className={`mt-0.5 text-lg font-bold tabular-nums ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {shards && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                      <th className="px-2 py-2">Shard</th>
                      <th className="px-2 py-2">Location</th>
                      <th className="px-2 py-2">Health</th>
                      <th className="px-2 py-2">Hiring schema</th>
                      <th className="px-2 py-2">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {shards.map((shard) => (
                      <tr key={shard.databaseId}>
                        <td className="px-2 py-2">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{shard.shardName || shard.databaseId}</span>
                          <span className="ml-1 text-[10px] text-slate-400">{shard.databaseName}</span>
                          {shard.isControlShard && <Badge variant="info" className="ml-1.5">control</Badge>}
                        </td>
                        <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{shard.locationCode || '—'}</td>
                        <td className="px-2 py-2">
                          <Badge variant={shard.healthStatus === 'HEALTHY' ? 'success' : shard.healthStatus === 'DEGRADED' ? 'warning' : 'danger'} dot>
                            {shard.healthStatus.toLowerCase()}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          {shard.hiringSchemaReady ? (
                            <Badge variant="success">ready</Badge>
                          ) : (
                            <Badge variant="danger">missing {shard.missingTables.length}</Badge>
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-slate-500 dark:text-slate-400">{shard.latencyMs != null ? `${shard.latencyMs}ms` : '—'}</td>
                      </tr>
                    ))}
                    {shards.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                          <Database className="mx-auto mb-1 h-5 w-5" /> No shards registered
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
