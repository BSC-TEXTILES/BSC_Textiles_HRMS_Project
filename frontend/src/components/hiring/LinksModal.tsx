'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { Copy, Plus, QrCode, RefreshCw, Trash2, Link2, Power } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { HiringLink, HiringLocation, LinkAnalytics, publicApplyUrl } from '@/lib/hiring';

interface LinksModalProps {
  open: boolean;
  onClose: () => void;
  formId: string;
  formTitle: string;
  locationIds: string[];
  allowOtherLocations: boolean;
  locations: HiringLocation[];
  onLinksChanged?: (count: number) => void;
}

export function LinksModal({
  open,
  onClose,
  formId,
  formTitle,
  locationIds,
  allowOtherLocations,
  locations,
  onLinksChanged,
}: LinksModalProps) {
  const [links, setLinks] = useState<HiringLink[]>([]);
  const [analytics, setAnalytics] = useState<LinkAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [newLocationId, setNewLocationId] = useState('');
  const [newMaxApplications, setNewMaxApplications] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, analyticsRes] = await Promise.all([
        api.get(`/hiring/forms/${formId}/links`),
        api.get(`/hiring/forms/${formId}/analytics`, { params: { days: 30 } }).catch(() => null),
      ]);
      setLinks(Array.isArray(linksRes.data) ? linksRes.data : []);
      setAnalytics(analyticsRes?.data ?? null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load share links');
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const linkableLocations = locations.filter((l) => allowOtherLocations || locationIds.includes(l.id));

  const copyUrl = async (code: string) => {
    try {
      await navigator.clipboard.writeText(publicApplyUrl(code));
      toast.success('Application link copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const showQr = async (code: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(publicApplyUrl(code), { width: 320, margin: 2 });
      setQrCode(code);
      setQrUrl(dataUrl);
    } catch {
      toast.error('Could not render QR code');
    }
  };

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/hiring/forms/${formId}/links`, {
        label: newLabel.trim() || null,
        locationId: newLocationId || null,
        maxApplications: newMaxApplications ? Number(newMaxApplications) : null,
        expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
      });
      toast.success('Share link created');
      setNewLabel('');
      setNewLocationId('');
      setNewMaxApplications('');
      setNewExpiresAt('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create link');
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async (link: HiringLink) => {
    setBusyId(link.id);
    try {
      await api.patch(`/hiring/links/${link.id}`, { enabled: !link.enabled });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update link');
    } finally {
      setBusyId(null);
    }
  };

  const regenerate = async (link: HiringLink) => {
    if (!confirm(`Regenerate the code for "${link.label || link.code}"? The old code stops working immediately.`)) return;
    setBusyId(link.id);
    try {
      await api.post(`/hiring/links/${link.id}/regenerate`);
      toast.success('New code generated');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to regenerate code');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (link: HiringLink) => {
    if (!confirm(`Delete the share link "${link.label || link.code}"?`)) return;
    setBusyId(link.id);
    try {
      await api.delete(`/hiring/links/${link.id}`);
      toast.success('Link deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete link');
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    if (!loading) onLinksChanged?.(links.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links.length, loading]);

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Share links — ${formTitle}`} className="max-w-3xl">
        <div className="space-y-5">
          {analytics && (
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Views (30d)</p>
                <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{analytics.totals.views}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Starts</p>
                <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{analytics.totals.starts}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Submissions</p>
                <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{analytics.totals.submissions}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {loading && links.length === 0 && (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            )}
            {!loading && links.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No share links yet. Create one below to get a URL and QR code for candidates.
              </p>
            )}
            {links.map((link) => {
              const pinned = locations.find((l) => l.id === link.locationId);
              const expired = link.expiresAt ? new Date(link.expiresAt).getTime() < Date.now() : false;
              const exhausted = link.maxApplications != null && link.submissions >= link.maxApplications;
              return (
                <div
                  key={link.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {link.code}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{link.label || 'Untitled link'}</span>
                      {link.enabled ? <Badge variant="success" dot>Active</Badge> : <Badge variant="neutral" dot>Disabled</Badge>}
                      {link.locationId && <Badge variant="info">{pinned ? `${pinned.code} pinned` : 'Location pinned'}</Badge>}
                      {expired && <Badge variant="danger">Expired</Badge>}
                      {exhausted && <Badge variant="warning">Limit reached</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {link.viewCount} views · {link.startCount} starts · {link.submissions} submissions
                      {link.maxApplications != null ? ` / ${link.maxApplications} max` : ''}
                      {link.expiresAt ? ` · expires ${new Date(link.expiresAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="xs" variant="outline" className="gap-1" onClick={() => copyUrl(link.code)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button size="xs" variant="outline" className="gap-1" onClick={() => showQr(link.code)}>
                      <QrCode className="h-3.5 w-3.5" /> QR
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="gap-1"
                      disabled={busyId === link.id}
                      onClick={() => toggleEnabled(link)}
                      title={link.enabled ? 'Disable link' : 'Enable link'}
                    >
                      <Power className={`h-3.5 w-3.5 ${link.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="gap-1"
                      disabled={busyId === link.id}
                      onClick={() => regenerate(link)}
                      title="Regenerate code"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      disabled={busyId === link.id}
                      onClick={() => remove(link)}
                      title="Delete link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={createLink} className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              <Link2 className="h-4 w-4" /> New share link
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Label"
                placeholder="e.g. Walk-in counter QR"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Select
                label="Pin to location (optional)"
                value={newLocationId}
                onChange={(e) => setNewLocationId(e.target.value)}
                options={[
                  { value: '', label: 'Any allowed location' },
                  ...linkableLocations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` })),
                ]}
              />
              <Input
                label="Max applications (optional)"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={newMaxApplications}
                onChange={(e) => setNewMaxApplications(e.target.value)}
              />
              <Input
                label="Expires on (optional)"
                type="date"
                value={newExpiresAt}
                onChange={(e) => setNewExpiresAt(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" className="gap-1.5" loading={loading}>
                <Plus className="h-3.5 w-3.5" /> Create link
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal open={!!qrUrl} onClose={() => setQrUrl(null)} title={`QR code — ${qrCode || ''}`}>
        <div className="flex flex-col items-center gap-3">
          {qrUrl && <img src={qrUrl} alt={`QR code for ${qrCode}`} className="h-64 w-64 rounded-lg border border-slate-200 dark:border-slate-700" />}
          <p className="break-all text-center text-xs text-slate-500 dark:text-slate-400">{qrCode ? publicApplyUrl(qrCode) : ''}</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => qrCode && copyUrl(qrCode)}>
            <Copy className="h-3.5 w-3.5" /> Copy link
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default LinksModal;
