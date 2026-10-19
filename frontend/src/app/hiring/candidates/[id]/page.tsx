'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Star, Phone, Mail, MapPin, Calendar, Download, FileText,
   MessageSquarePlus, Trash2, CalendarPlus, History, User, CreditCard, Clock,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { canAction, useAccessSnapshot } from '@/lib/rbac';
import { useSocket } from '@/context/SocketContext';
import { HireError } from '@/components/hiring/HireError';
import { StageBadge } from '@/components/hiring/StageBadge';
import {
  ApplicationDetail, HiringInterview, answerValue, movableStages, stageMeta,
} from '@/lib/hiring';

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { socket } = useSocket();
  const access = useAccessSnapshot();
  const canUpdate = canAction(access, 'RECRUITMENT', 'update');
  const canDelete = canAction(access, 'RECRUITMENT', 'delete');

  const applicationId = params?.id;
  const locationHint = searchParams?.get('location') || undefined;

  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [stageTarget, setStageTarget] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [interviewForm, setInterviewForm] = useState({
    round: '1', mode: 'IN_PERSON', scheduledAt: '', durationMinutes: '30',
    interviewerName: '', meetingLink: '',
  });

  const load = useCallback(async (silent = false) => {
    if (!applicationId) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/hiring/applications/${applicationId}`, {
        params: { locationId: locationHint },
      });
      setDetail(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load this application');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applicationId, locationHint]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket || !applicationId) return;
    const refresh = () => load(true);
    socket.on('hiring:application:stage', refresh);
    socket.on('hiring:application:note', refresh);
    socket.on('hiring:application:interview', refresh);
    return () => {
      socket.off('hiring:application:stage', refresh);
      socket.off('hiring:application:note', refresh);
      socket.off('hiring:application:interview', refresh);
    };
  }, [socket, applicationId, load]);

  const app = detail?.application;
  const candidate = detail?.candidate;

  const changeStage = async () => {
    if (!detail || !stageTarget) return;
    setBusy(true);
    try {
      const res = await api.patch(`/hiring/applications/${detail.application.id}/stage`, {
        toStage: stageTarget,
        note: stageNote.trim() || undefined,
        locationId: detail.application.locationId,
        shard: detail.application.shard,
      });
      setDetail(res.data);
      toast.success(`Moved to ${stageMeta(stageTarget).label}`);
      setStageTarget('');
      setStageNote('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to change stage');
    } finally {
      setBusy(false);
    }
  };

  const patchApplication = async (patch: Record<string, unknown>, success?: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await api.patch(`/hiring/applications/${detail.application.id}`, {
        ...patch,
        locationId: detail.application.locationId,
        shard: detail.application.shard,
      });
      setDetail(res.data);
      if (success) toast.success(success);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!detail || !noteBody.trim()) return;
    setBusy(true);
    try {
      await api.post(`/hiring/applications/${detail.application.id}/notes`, {
        body: noteBody.trim(),
        locationId: detail.application.locationId,
        shard: detail.application.shard,
      });
      setNoteBody('');
      toast.success('Note added');
      await load(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to add note');
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!detail || !confirm('Delete this note?')) return;
    setBusy(true);
    try {
      await api.delete(`/hiring/applications/${detail.application.id}/notes/${noteId}`, {
        params: { locationId: detail.application.locationId, shard: detail.application.shard },
      });
      toast.success('Note deleted');
      await load(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete note');
    } finally {
      setBusy(false);
    }
  };

  const scheduleInterview = async () => {
    if (!detail) return;
    if (!interviewForm.scheduledAt) {
      toast.error('Pick a date and time');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/hiring/applications/${detail.application.id}/interviews`, {
        round: Number(interviewForm.round) || 1,
        mode: interviewForm.mode,
        scheduledAt: new Date(interviewForm.scheduledAt).toISOString(),
        durationMinutes: Number(interviewForm.durationMinutes) || 30,
        interviewerName: interviewForm.interviewerName.trim() || null,
        meetingLink: interviewForm.meetingLink.trim() || null,
        locationId: detail.application.locationId,
        shard: detail.application.shard,
      });
      toast.success('Interview scheduled');
      setShowInterviewModal(false);
      setInterviewForm({ round: '1', mode: 'IN_PERSON', scheduledAt: '', durationMinutes: '30', interviewerName: '', meetingLink: '' });
      await load(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to schedule interview');
    } finally {
      setBusy(false);
    }
  };

  const updateInterview = async (interview: HiringInterview, patch: Record<string, unknown>) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.patch(`/hiring/applications/${detail.application.id}/interviews/${interview.id}`, {
        ...patch,
        locationId: detail.application.locationId,
        shard: detail.application.shard,
      });
      toast.success('Interview updated');
      await load(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update interview');
    } finally {
      setBusy(false);
    }
  };

  const downloadDocument = async (documentId: string, fileName: string | null) => {
    if (!detail) return;
    try {
      const res = await api.get(`/hiring/applications/${detail.application.id}/documents/${documentId}/download`, {
        params: { locationId: detail.application.locationId, shard: detail.application.shard },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the document');
    }
  };

  const answers = useMemo(() => detail?.answers || [], [detail]);

  if (loading && !detail) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !app || !candidate) {
    return (
      <DashboardLayout>
        <HireError message={error || 'Application not found'} onRetry={() => load()} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Button variant="ghost" size="sm" onClick={() => router.push('/hiring/candidates')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Link href="/hiring/candidates" className="hover:underline">Candidate Pipeline</Link>
          <span>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">{candidate.fullName || 'Candidate'}</span>
        </div>

        <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1346a1]/10 text-lg font-bold text-[#1346a1] dark:bg-sky-950/60 dark:text-sky-300">
                {(candidate.fullName || '?').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">{candidate.fullName || 'Unknown candidate'}</h1>
                  <StageBadge stage={app.stage} />
                  {app.starred && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {app.jobTitle || '—'} · <span className="font-mono text-xs">{app.id}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {candidate.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {candidate.phone}</span>}
                  {candidate.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {candidate.email}</span>}
                  {candidate.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {candidate.city}</span>}
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Applied {fmtDateTime(app.appliedAt)}</span>
                  {app.locationCode && <Badge variant="info">{app.locationCode}</Badge>}
                  {app.shard && <Badge variant="neutral">{app.shard}</Badge>}
                </div>
              </div>
            </div>

            {canUpdate && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(app.rating ?? '')}
                  onChange={(e) => patchApplication({ rating: e.target.value ? Number(e.target.value) : null }, 'Rating updated')}
                  options={[
                    { value: '', label: 'No rating' },
                    ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} (${n})` })),
                  ]}
                  className="w-36"
                />
                <Button
                  size="sm"
                  variant={app.starred ? 'primary' : 'outline'}
                  className="gap-1"
                  disabled={busy}
                  onClick={() => patchApplication({ starred: !app.starred })}
                >
                  <Star className={`h-3.5 w-3.5 ${app.starred ? 'fill-white' : ''}`} /> {app.starred ? 'Starred' : 'Star'}
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowInterviewModal(true)}>
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule interview
                </Button>
              </div>
            )}
          </div>

          {canUpdate && movableStages(app.stage).length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Select
                value={stageTarget}
                onChange={(e) => setStageTarget(e.target.value)}
                options={[{ value: '', label: 'Move to stage…' }, ...movableStages(app.stage).map((s) => ({ value: s, label: stageMeta(s).label }))]}
                className="w-52"
              />
              <Input
                placeholder="Stage note (optional)"
                value={stageNote}
                onChange={(e) => setStageNote(e.target.value)}
                className="w-64"
              />
              <Button size="sm" onClick={changeStage} disabled={!stageTarget || busy}>Move candidate</Button>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <FileText className="h-4 w-4" /> Application answers
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {answers.map((answer) => (
                  <div key={answer.fieldKey} className="border-b border-slate-50 pb-2 dark:border-slate-800/60">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{answer.fieldLabel || answer.fieldKey}</p>
                    <p className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200">{answerValue(answer)}</p>
                  </div>
                ))}
                {answers.length === 0 && <p className="text-sm text-slate-400">No answers stored.</p>}
              </div>
            </Card>

            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Download className="h-4 w-4" /> Documents
              </h2>
              <div className="mt-3 space-y-2">
                {detail.documents.length === 0 && <p className="text-sm text-slate-400">No documents attached.</p>}
                {detail.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{doc.fileName || doc.fieldKey || 'Document'}</p>
                      <p className="text-[11px] text-slate-400">
                        {doc.mimeType || 'file'}{doc.sizeBytes ? ` · ${(doc.sizeBytes / 1024).toFixed(0)} KB` : ''}
                      </p>
                    </div>
                    <Button size="xs" variant="outline" className="gap-1" onClick={() => downloadDocument(doc.id, doc.fileName)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Clock className="h-4 w-4" /> Interviews
              </h2>
              <div className="mt-3 space-y-2">
                {detail.interviews.length === 0 && <p className="text-sm text-slate-400">No interviews scheduled.</p>}
                {detail.interviews.map((interview) => (
                  <div key={interview.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          Round {interview.round ?? 1} · {interview.mode || 'IN_PERSON'} · {fmtDateTime(interview.scheduledAt)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {interview.interviewerName || 'Interviewer TBD'}
                          {interview.meetingLink ? ` · ${interview.meetingLink}` : ''}
                        </p>
                      </div>
                      <Badge variant={interview.status === 'COMPLETED' ? 'success' : interview.status === 'CANCELLED' ? 'danger' : 'info'} dot>
                        {(interview.status || 'SCHEDULED').toLowerCase()}
                      </Badge>
                    </div>
                    {canUpdate && interview.status !== 'COMPLETED' && interview.status !== 'CANCELLED' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busy}
                          onClick={() => updateInterview(interview, { status: 'COMPLETED', outcome: 'PASSED' })}
                        >
                          Mark completed
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => updateInterview(interview, { status: 'CANCELLED' })}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                    {interview.feedback && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{interview.feedback}</p>}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <MessageSquarePlus className="h-4 w-4" /> Internal notes
              </h2>
              {canUpdate && (
                <div className="mt-3 flex items-start gap-2">
                  <textarea
                    rows={2}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Interview feedback, reference check, salary discussion…"
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#1346a1] focus:outline-none focus:ring-1 focus:ring-[#1346a1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <Button size="sm" onClick={addNote} disabled={!noteBody.trim() || busy}>Add note</Button>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {detail.notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
                {detail.notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{note.authorName || note.authorId || 'Team'}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">{fmtDateTime(note.createdAt)}</span>
                        {canDelete && (
                          <button type="button" onClick={() => deleteNote(note.id)} className="text-red-500 hover:text-red-700" disabled={busy}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{note.body}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <User className="h-4 w-4" /> Candidate profile
              </h2>
              <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <p><span className="text-xs text-slate-400">Phone:</span> {candidate.phone || '—'}</p>
                <p><span className="text-xs text-slate-400">Email:</span> {candidate.email || '—'}</p>
                <p><span className="text-xs text-slate-400">City:</span> {candidate.city || '—'}</p>
                {candidate.dob && <p><span className="text-xs text-slate-400">Date of birth:</span> {String(candidate.dob).slice(0, 10)}</p>}
                {candidate.gender && <p><span className="text-xs text-slate-400">Gender:</span> {candidate.gender}</p>}
                <p><span className="text-xs text-slate-400">Applications:</span> {candidate.applicationCount}</p>
                {candidate.firstSeenAt && <p><span className="text-xs text-slate-400">First seen:</span> {fmtDateTime(candidate.firstSeenAt)}</p>}
              </div>
              {(candidate.hasAadhaar || candidate.hasPan) && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  {candidate.hasAadhaar && (
                    <p className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Aadhaar {candidate.aadhaarMasked || 'on file'}</p>
                  )}
                  {candidate.hasPan && (
                    <p className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> PAN {candidate.panMasked || 'on file'}</p>
                  )}
                  <p className="text-[10px] text-slate-400">Stored encrypted; only the masked value is shown.</p>
                </div>
              )}
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <Link
                  href={`/hiring/candidates?search=${encodeURIComponent(candidate.phone || candidate.fullName || '')}`}
                  className="text-xs font-medium text-[#1346a1] hover:underline dark:text-sky-400"
                >
                  View all applications from this candidate →
                </Link>
              </div>
            </Card>

            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <History className="h-4 w-4" /> Timeline
              </h2>
              <div className="mt-4 space-y-4">
                {detail.timeline.map((entry, index) => (
                  <div key={entry.id} className="relative pl-5">
                    <span className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-[#1346a1]' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    {index < detail.timeline.length - 1 && <span className="absolute left-[4.5px] top-4 h-full w-px bg-slate-200 dark:bg-slate-700" />}
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{entry.title}</p>
                    {entry.body && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{entry.body}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {fmtDateTime(entry.createdAt)}{entry.actorName ? ` · ${entry.actorName}` : ''}
                    </p>
                  </div>
                ))}
                {detail.timeline.length === 0 && <p className="text-sm text-slate-400">No activity recorded.</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal open={showInterviewModal} onClose={() => setShowInterviewModal(false)} title="Schedule interview">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Round" type="number" min={1} value={interviewForm.round} onChange={(e) => setInterviewForm({ ...interviewForm, round: e.target.value })} />
            <Select
              label="Mode"
              value={interviewForm.mode}
              onChange={(e) => setInterviewForm({ ...interviewForm, mode: e.target.value })}
              options={[
                { value: 'IN_PERSON', label: 'In person' },
                { value: 'PHONE', label: 'Phone' },
                { value: 'VIDEO', label: 'Video call' },
              ]}
            />
          </div>
          <Input
            label="Date & time"
            type="datetime-local"
            value={interviewForm.scheduledAt}
            onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (minutes)"
              type="number"
              min={10}
              value={interviewForm.durationMinutes}
              onChange={(e) => setInterviewForm({ ...interviewForm, durationMinutes: e.target.value })}
            />
            <Input
              label="Interviewer"
              placeholder="e.g. Store Manager"
              value={interviewForm.interviewerName}
              onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
            />
          </div>
          {interviewForm.mode === 'VIDEO' && (
            <Input
              label="Meeting link"
              placeholder="https://…"
              value={interviewForm.meetingLink}
              onChange={(e) => setInterviewForm({ ...interviewForm, meetingLink: e.target.value })}
            />
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button variant="outline" onClick={() => setShowInterviewModal(false)}>Cancel</Button>
            <Button onClick={scheduleInterview} loading={busy}>Schedule</Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
