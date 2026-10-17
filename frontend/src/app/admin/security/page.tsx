'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Activity, Ban, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, Timer, Trash2, Unlock, Users,
} from 'lucide-react';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessNav } from '@/components/access/AccessNav';
import { RequireModule } from '@/components/access/RequireModule';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { useMyAccess } from '@/lib/rbac';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'sessions' | 'ips' | 'lockouts' | 'keys';

interface Dashboard {
  window: { failedLogins24h: number; lockedAccounts: number };
  activeSessions: number;
  blockedIps: number;
  passwordSprayTargets15m: number;
  topFailingIps: Array<{ ipAddress: string; failures: number }>;
  events: Array<{ id: string; type: string; severity: string; ipAddress: string | null; userId: string | null; riskScore: number; createdAt: string; acknowledged: number }>;
  infrastructure: { store: string; redisConfigured: boolean; signingAlgorithm: string; activeKid: string | null; keyCount: number };
  policy: Record<string, number>;
}

interface SessionRow {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  ipAddress: string | null;
  userAgent: string | null;
  authMethod: string;
  createdAt: string;
  lastActivityAt: string;
  idleExpiresAt: string | null;
  expiresAt: string;
}

interface IpRule {
  id: string;
  type: 'allow' | 'deny';
  ipAddress: string | null;
  cidr: string | null;
  label: string | null;
  reason: string | null;
  source: string;
  enabled: boolean;
  hits: number;
  expiresAt: string | null;
}

function message(err: any, fallback: string): string {
  return err?.response?.data?.message || err?.response?.data?.error || fallback;
}

function ago(value?: string | null): string {
  if (!value) return '—';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const TABS: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'overview', label: 'Posture', icon: Activity },
  { id: 'sessions', label: 'Active sessions', icon: Users },
  { id: 'ips', label: 'IP rules', icon: Ban },
  { id: 'lockouts', label: 'Lockouts', icon: Unlock },
  { id: 'keys', label: 'Keys & settings', icon: KeyRound },
];

export default function SecurityDashboardPage() {
  const access = useMyAccess();
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [rules, setRules] = useState<IpRule[]>([]);
  const [locked, setLocked] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<SessionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [posture, sessionList, ipRules, lockouts] = await Promise.all([
        api.get('/admin/security/dashboard'),
        api.get('/admin/security/sessions'),
        api.get('/admin/security/ip-rules'),
        api.get('/admin/security/lockouts'),
      ]);
      setDashboard(posture.data);
      setSessions(sessionList.data.sessions || []);
      setRules(ipRules.data.rules || []);
      setLocked(lockouts.data.locked || []);
    } catch (err: any) {
      const text = message(err, 'Could not load the security posture');
      setError(text);
      toast.error(text);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.loading) return;
    load();
  }, [access.loading, load]);

  const revoke = async () => {
    if (!confirmRevoke) return;
    setBusy(true);
    try {
      await api.post(`/admin/security/sessions/${confirmRevoke.id}/revoke`, {});
      toast.success('Session revoked');
      setConfirmRevoke(null);
      await load();
    } catch (err: any) {
      toast.error(message(err, 'Could not revoke the session'));
    } finally {
      setBusy(false);
    }
  };

  const mayWrite = access.source !== 'rbac' || access.canAssignModuleAccess || access.roles.includes('SUPER_ADMIN');

  return (
    <DashboardLayout>
      <RequireModule module="SECURITY_MONITORING">
        <div className="space-y-5">
          <AccessNav access={access} />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Security Operations</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                Sign-in failures, live sessions, blocked networks and signing-key status. Every action here is audited.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-slate-700">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium',
                    tab === item.id
                      ? 'border-[#1346a1] text-[#1346a1] dark:border-blue-400 dark:text-blue-300'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {error && !loading && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm text-red-600">{error}</p>
                <Button size="sm" variant="outline" onClick={load}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {tab === 'overview' && dashboard && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'Failed logins (24h)', value: dashboard.window.failedLogins24h, warn: dashboard.window.failedLogins24h > 20 },
                  { label: 'Locked accounts', value: dashboard.window.lockedAccounts, warn: dashboard.window.lockedAccounts > 0 },
                  { label: 'Active sessions', value: dashboard.activeSessions },
                  { label: 'Blocked IPs', value: dashboard.blockedIps, warn: dashboard.blockedIps > 0 },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{stat.label}</p>
                      <p className={cn('text-2xl font-semibold', stat.warn ? 'text-amber-600' : 'text-gray-900 dark:text-slate-100')}>
                        {stat.value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Infrastructure</h2>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Shared store">
                      <Badge variant={dashboard.infrastructure.store === 'redis' ? 'success' : 'warning'} dot>
                        {dashboard.infrastructure.store === 'redis' ? 'Redis' : 'in-process'}
                      </Badge>
                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {dashboard.infrastructure.redisConfigured
                          ? 'REDIS_URL configured'
                          : 'set REDIS_URL to share limits across processes'}
                      </span>
                    </Row>
                    <Row label="Token signing">
                      <span className="font-mono text-xs">{dashboard.infrastructure.signingAlgorithm}</span>
                      <span className="font-mono text-xs text-gray-500 dark:text-slate-400">kid {dashboard.infrastructure.activeKid ?? '—'}</span>
                    </Row>
                    <Row label="Policy">
                      <span className="text-xs text-gray-600 dark:text-slate-300">
                        {dashboard.policy.maxAttempts} attempts → {dashboard.policy.lockoutSeconds}s cooldown · captcha after{' '}
                        {dashboard.policy.captchaAfter}
                      </span>
                    </Row>
                    <Row label="Limits">
                      <span className="text-xs text-gray-600 dark:text-slate-300">
                        {dashboard.policy.globalRateLimitPerSecond} req/s per IP · {dashboard.policy.sensitiveRateLimit}/min on auth
                        endpoints
                      </span>
                    </Row>
                    <Row label="Session">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300">
                        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                        {Math.round((dashboard.policy.idleTimeoutSeconds || 0) / 60)}m idle ·{' '}
                        {Math.round((dashboard.policy.absoluteTimeoutSeconds || 0) / 3600)}h absolute
                      </span>
                    </Row>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Top failing sources (15m)</h2>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dashboard.topFailingIps.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-slate-400">No failed sign-ins in the window.</p>
                    )}
                    {dashboard.topFailingIps.map((entry) => (
                      <div key={entry.ipAddress} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs text-gray-700 dark:text-slate-300">{entry.ipAddress}</span>
                        <span className="tabular-nums text-gray-500 dark:text-slate-400">{entry.failures} failures</span>
                      </div>
                    ))}
                    {dashboard.passwordSprayTargets15m > 3 && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        {dashboard.passwordSprayTargets15m} distinct login IDs have failed in the last 15 minutes — the
                        signature of a password-spray attempt.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card padding={false}>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Recent security events</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Detection events from login protection, token reuse and configuration changes.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium">Severity</th>
                          <th className="px-4 py-2 font-medium">Source</th>
                          <th className="px-4 py-2 font-medium">Risk</th>
                          <th className="px-4 py-2 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                        {dashboard.events.map((event) => (
                          <tr key={event.id}>
                            <td className="px-4 py-2 font-medium text-gray-800 dark:text-slate-200">
                              {event.type.replace(/_/g, ' ')}
                            </td>
                            <td className="px-4 py-2">
                              <Badge
                                variant={
                                  event.severity === 'CRITICAL'
                                    ? 'danger'
                                    : event.severity === 'HIGH'
                                      ? 'danger'
                                      : event.severity === 'MEDIUM'
                                        ? 'warning'
                                        : 'gray'
                                }
                              >
                                {event.severity}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-slate-300">
                              {event.ipAddress || '—'}
                            </td>
                            <td className="px-4 py-2 tabular-nums text-gray-600 dark:text-slate-300">{event.riskScore}</td>
                            <td className="px-4 py-2 text-gray-500 dark:text-slate-400">{ago(event.createdAt)}</td>
                          </tr>
                        ))}
                        {dashboard.events.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
                              No security events recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'sessions' && (
            <Card padding={false}>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Live sessions</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Revoking ends that device immediately: the access token is refused and the refresh token family is spent.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2 font-medium">User</th>
                        <th className="px-4 py-2 font-medium">IP</th>
                        <th className="px-4 py-2 font-medium">Client</th>
                        <th className="px-4 py-2 font-medium">Last activity</th>
                        <th className="px-4 py-2 font-medium">Absolute expiry</th>
                        <th className="px-4 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {sessions.map((session) => (
                        <tr key={session.id}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900 dark:text-slate-100">{session.fullName}</div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {session.email} · {session.role}
                            </div>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{session.ipAddress || '—'}</td>
                          <td className="max-w-[220px] truncate px-4 py-2 text-xs text-gray-500 dark:text-slate-400">
                            {session.userAgent || '—'}
                          </td>
                          <td className="px-4 py-2 text-xs">{ago(session.lastActivityAt)}</td>
                          <td className="px-4 py-2 text-xs">{new Date(session.expiresAt).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right">
                            {mayWrite && (
                              <Button variant="ghost" size="xs" className="text-red-600" onClick={() => setConfirmRevoke(session)}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {sessions.length === 0 && !loading && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                            No live sessions.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'ips' && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Add a rule</h2>
                </CardHeader>
                <CardContent>
                  <IpRuleForm onSaved={load} disabled={!mayWrite} />
                </CardContent>
              </Card>
              <Card padding={false} className="lg:col-span-2">
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Current rules</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    A deny match is refused before the rate limiter runs; an allow match skips the limiter.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rules.length === 0 && <p className="text-sm text-gray-500">No rules defined.</p>}
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={rule.type === 'deny' ? 'danger' : 'success'}>{rule.type}</Badge>
                          <span className="font-mono text-xs">{rule.cidr || rule.ipAddress}</span>
                          {rule.source === 'auto_block' && <Badge variant="warning">automatic</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">
                          {rule.label || rule.reason || 'no reason given'} · {rule.hits} hits
                          {rule.expiresAt ? ` · expires ${new Date(rule.expiresAt).toLocaleString()}` : ''}
                        </p>
                      </div>
                      {mayWrite && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            try {
                              await api.delete(`/admin/security/ip-rules/${rule.id}`);
                              toast.success('Rule removed');
                              load();
                            } catch (err: any) {
                              toast.error(message(err, 'Could not remove the rule'));
                            }
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'lockouts' && (
            <Card padding={false}>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Locked and recently failing accounts</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Cooldowns expire on their own after {dashboard?.policy.lockoutSeconds ?? 180} seconds. Unlocking clears
                  both the counter and the durable lock.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2 font-medium">Account</th>
                      <th className="px-4 py-2 font-medium">Failed</th>
                      <th className="px-4 py-2 font-medium">Lockouts</th>
                      <th className="px-4 py-2 font-medium">Locked until</th>
                      <th className="px-4 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {locked.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{row.fullName}</div>
                          <div className="font-mono text-xs text-gray-500 dark:text-slate-400">{row.loginId || row.email}</div>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{row.failedLoginAttempts}</td>
                        <td className="px-4 py-2 tabular-nums">{row.consecutiveLockouts}</td>
                        <td className="px-4 py-2 text-xs">
                          {row.lockedUntil && new Date(row.lockedUntil) > new Date()
                            ? new Date(row.lockedUntil).toLocaleTimeString()
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {mayWrite && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={async () => {
                                try {
                                  await api.post(`/admin/security/lockouts/${row.id}/unlock`, {});
                                  toast.success('Unlocked');
                                  load();
                                } catch (err: any) {
                                  toast.error(message(err, 'Could not unlock'));
                                }
                              }}
                            >
                              <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                              Unlock
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {locked.length === 0 && !loading && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                          No account is locked, and none has a recent lockout.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {tab === 'keys' && <KeysPanel onRotated={load} mayWrite={mayWrite} />}

          <ConfirmDialog
            open={Boolean(confirmRevoke)}
            title="Revoke this session?"
            confirmLabel="Revoke session"
            loading={busy}
            message={
              <>
                {confirmRevoke?.fullName} will be signed out on that device at their next request. Their refresh token is
                spent, so the session cannot silently come back.
              </>
            }
            onConfirm={revoke}
            onCancel={() => setConfirmRevoke(null)}
          />
        </div>
      </RequireModule>
    </DashboardLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 last:border-0 dark:border-slate-800">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

function IpRuleForm({ onSaved, disabled }: { onSaved: () => void; disabled: boolean }) {
  const [type, setType] = useState('deny');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState('60');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const isRange = value.includes('/');
      await api.post('/admin/security/ip-rules', {
        type,
        ipAddress: isRange ? null : value.trim(),
        cidr: isRange ? value.trim() : null,
        reason: reason.trim() || undefined,
        ttlSeconds: type === 'deny' ? Math.max(0, Number(ttlMinutes) || 0) * 60 : undefined,
      });
      toast.success('Rule added');
      setValue('');
      setReason('');
      onSaved();
    } catch (err: any) {
      toast.error(message(err, 'Could not add the rule'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Select
        label="Effect"
        value={type}
        disabled={disabled}
        onChange={(event) => setType(event.target.value)}
        options={[
          { value: 'deny', label: 'Deny (block)' },
          { value: 'allow', label: 'Allow (skip rate limit)' },
        ]}
      />
      <Input
        label="IP or CIDR"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="203.0.113.7 or 10.0.0.0/16"
        required
      />
      <Input label="Reason" value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} placeholder="Shown in the audit trail" />
      {type === 'deny' && (
        <Input
          label="Block for (minutes, 0 = permanent)"
          type="number"
          min={0}
          value={ttlMinutes}
          disabled={disabled}
          onChange={(event) => setTtlMinutes(event.target.value)}
        />
      )}
      <Button type="submit" size="sm" className="w-full" loading={saving} disabled={disabled || !value.trim()}>
        Add rule
      </Button>
      {disabled && <p className="text-[11px] text-gray-500">Your role can view but not change these rules.</p>}
    </form>
  );
}

function KeysPanel({ onRotated, mayWrite }: { onRotated: () => void; mayWrite: boolean }) {
  const [keys, setKeys] = useState<any>(null);
  const [settings, setSettings] = useState<any[]>([]);
  const [expiryDays, setExpiryDays] = useState('90');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [singleSession, setSingleSession] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [keyList, settingList] = await Promise.all([api.get('/admin/security/keys'), api.get('/admin/security/settings')]);
    setKeys(keyList.data);
    setSettings(settingList.data.settings || []);
    const byKey = new Map((settingList.data.settings || []).map((row: any) => [row.key, row.value]));
    setExpiryDays(String(byKey.get('password_expiry_days') ?? '90'));
    setMfaRequired(byKey.get('mfa_required_for_privileged') === 'true');
    setSingleSession(byKey.get('single_active_session') === 'true');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.put('/admin/security/settings', {
        settings: [
          { key: 'password_expiry_days', value: String(Number(expiryDays) || 0) },
          { key: 'mfa_required_for_privileged', value: String(mfaRequired) },
          { key: 'single_active_session', value: String(singleSession) },
        ],
      });
      toast.success('Settings saved');
      onRotated();
    } catch (err: any) {
      toast.error(message(err, 'Could not save settings'));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/admin/security/keys/rotate', {});
      toast.success(`Rotated to ${data.kid}`);
      await load();
      onRotated();
    } catch (err: any) {
      toast.error(message(err, 'Could not rotate the key'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Signing keys</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            The public half is published at <span className="font-mono">/.well-known/jwks.json</span>. Rotating keeps the
            outgoing key verifying for its grace period so in-flight tokens are not cut off.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="Algorithm">
            <span className="font-mono text-xs">{keys?.algorithm ?? '—'}</span>
          </Row>
          <Row label="Active kid">
            <span className="font-mono text-xs">{keys?.activeKid ?? '—'}</span>
          </Row>
          <Row label="Rotation window">
            <span className="text-xs">{keys?.rotationDays ?? '—'} days</span>
          </Row>
          {keys?.keys?.slice(0, 6).map((key: any) => (
            <div key={key.kid} className="flex items-center justify-between text-xs">
              <span className="font-mono text-gray-600 dark:text-slate-300">{key.kid}</span>
              <span className="flex items-center gap-2">
                <Badge variant={key.status === 'active' ? 'success' : key.status === 'retiring' ? 'warning' : 'gray'}>{key.status}</Badge>
                <span className="text-gray-400">{new Date(key.createdAt).toLocaleDateString()}</span>
              </span>
            </div>
          ))}
          {mayWrite && (
            <Button size="sm" variant="outline" onClick={rotate} loading={busy} className="w-full">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Rotate signing key now
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Runtime policy</h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Everything else (thresholds, TTLs, secrets) is environment-driven and deliberately not editable here.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            label="Password expiry (days, 0 = never)"
            type="number"
            min={0}
            value={expiryDays}
            disabled={!mayWrite}
            onChange={(event) => setExpiryDays(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
            <input type="checkbox" checked={mfaRequired} disabled={!mayWrite} onChange={(event) => setMfaRequired(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#1346a1]" />
            Require TOTP for Admin and Super Admin sign-in
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
            <input type="checkbox" checked={singleSession} disabled={!mayWrite} onChange={(event) => setSingleSession(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#1346a1]" />
            Single active session per user
          </label>
          {mayWrite && (
            <Button size="sm" onClick={saveSettings} loading={busy} className="w-full">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Save policy
            </Button>
          )}
          <p className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Requiring TOTP takes effect at the next sign-in; sessions already open are not upgraded. Rotation of a
            signing key does not invalidate issued tokens until they expire.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
