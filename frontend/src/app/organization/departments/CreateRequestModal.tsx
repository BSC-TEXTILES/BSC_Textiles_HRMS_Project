'use client';

/**
 * CreateRequestModal — employee assignment, transfer, and general change requests.
 *
 * Submits a change request through the approval workflow API. The request is
 * created in DRAFT status and submitted immediately; it does NOT modify any
 * active employee record until fully approved by the required reviewers.
 */
import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface CreateRequestModalProps {
  isOpen: boolean;
  mode: 'ASSIGN' | 'TRANSFER' | 'CREATE';
  selectedLocation?: string;
  selectedNode?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateRequestModal({
  isOpen,
  mode,
  selectedLocation,
  selectedNode,
  onClose,
  onSuccess,
}: CreateRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [workAreas, setWorkAreas] = useState<any[]>([]);

  const [form, setForm] = useState({
    employeeId: '',
    reason: '',
    // For ASSIGN: target location/floor/dept/section/workarea
    targetLocationId: selectedLocation || '',
    targetFloorId: '',
    targetDepartmentId: '',
    targetSectionId: '',
    targetWorkAreaId: '',
    // For TRANSFER: source info (read-only) + target
    sourceLocationId: '',
    sourceFloorId: '',
    sourceDepartmentId: '',
    sourceSectionId: '',
  });

  /* ---- fetch dropdown data ---- */
  useEffect(() => {
    if (!isOpen) return;
    const loc = selectedLocation || form.targetLocationId;
    const qs = loc ? `?locationId=${loc}` : '';
    Promise.all([
      api.get(`/organization/roster${qs}&limit=200`).catch(() => ({ data: { data: { employees: [] } } })),
      loc ? api.get(`/floors?locationId=${loc}`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      loc ? api.get(`/departments?locationId=${loc}&limit=100`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([empRes, floorRes, deptRes]) => {
      setEmployees(empRes.data?.data?.employees ?? empRes.data?.employees ?? []);
      setFloors(floorRes.data?.floors ?? floorRes.data ?? []);
      setDepartments(deptRes.data?.departments ?? deptRes.data ?? []);
    });
  }, [isOpen, selectedLocation, form.targetLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- fetch sections when department changes ---- */
  useEffect(() => {
    if (!form.targetDepartmentId) { setSections([]); return; }
    api.get(`/sections?departmentId=${form.targetDepartmentId}&limit=100`)
      .then((res) => setSections(res.data?.sections ?? res.data ?? []))
      .catch(() => setSections([]));
  }, [form.targetDepartmentId]);

  /* ---- fetch work areas when section changes ---- */
  useEffect(() => {
    if (!form.targetSectionId) { setWorkAreas([]); return; }
    api.get(`/selling-points?sectionId=${form.targetSectionId}&limit=100`)
      .then((res) => setWorkAreas(res.data?.sellingPoints ?? res.data?.data ?? res.data ?? []))
      .catch(() => setWorkAreas([]));
  }, [form.targetSectionId]);

  /* ---- when employee selected for TRANSFER, load their current assignment ---- */
  useEffect(() => {
    if (mode !== 'TRANSFER' || !form.employeeId) return;
    api.get(`/organization/employees/${form.employeeId}/assignment`)
      .then((res) => {
        const d = res.data?.data ?? res.data;
        if (d) {
          setForm((prev) => ({
            ...prev,
            sourceLocationId: d.locationId || '',
            sourceFloorId: d.floorId || '',
            sourceDepartmentId: d.departmentId || '',
            sourceSectionId: d.sectionId || '',
          }));
        }
      })
      .catch(() => {});
  }, [mode, form.employeeId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId) { toast.error('Please select an employee'); return; }
    if (!form.reason || form.reason.trim().length < 5) { toast.error('Please provide a reason (min 5 characters)'); return; }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        employeeId: form.employeeId,
        reason: form.reason.trim(),
      };
      if (form.targetLocationId) payload.locationId = form.targetLocationId;
      if (form.targetFloorId) payload.floorId = form.targetFloorId;
      if (form.targetDepartmentId) payload.departmentId = form.targetDepartmentId;
      if (form.targetSectionId) payload.sectionId = form.targetSectionId;
      if (form.targetWorkAreaId) payload.workAreaId = form.targetWorkAreaId;

      const requestType = mode === 'TRANSFER' ? 'EMPLOYEE_TRANSFER' : 'EMPLOYEE_ALLOCATION';
      const action = mode === 'TRANSFER' ? 'TRANSFER' : 'ASSIGN';

      await api.post('/organization/approvals/requests', {
        requestType,
        action,
        reason: form.reason.trim(),
        locationId: form.targetLocationId || null,
        employeeId: form.employeeId,
        payload,
        submit: true,
      });

      toast.success(mode === 'TRANSFER' ? 'Transfer request submitted for approval' : 'Assignment request submitted for approval');
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Failed to submit request';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [form, mode, onSuccess]);

  if (!isOpen) return null;

  const title = mode === 'TRANSFER' ? 'Transfer Employee' : mode === 'ASSIGN' ? 'Assign Employee' : 'New Change Request';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-bold text-[#0b1c30] dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#1346a1] dark:text-[#E8DCC6]">
              {mode === 'TRANSFER' ? 'swap_horiz' : 'person_add'}
            </span>
            {title}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Close">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] mt-0.5">info</span>
          <span>
            This creates a change request that requires manager and HR approval. The employee&apos;s current assignment is NOT modified until the request is fully approved.
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Employee selector */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Employee *</label>
            <select
              value={form.employeeId}
              onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white focus:ring-2 focus:ring-[#1346a1] focus:border-transparent"
              required
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode || emp.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          {/* Source info (TRANSFER only, read-only) */}
          {mode === 'TRANSFER' && form.sourceLocationId && (
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-bold text-[#0b1c30] dark:text-white">Current assignment:</span>{' '}
              {[form.sourceLocationId, form.sourceDepartmentId, form.sourceSectionId].filter(Boolean).join(' → ') || 'Not set'}
            </div>
          )}

          {/* Target location */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Target Location</label>
            <select
              value={form.targetLocationId}
              onChange={(e) => setForm((p) => ({ ...p, targetLocationId: e.target.value, targetFloorId: '', targetDepartmentId: '', targetSectionId: '', targetWorkAreaId: '' }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white focus:ring-2 focus:ring-[#1346a1] focus:border-transparent"
            >
              <option value="">Select location…</option>
              {floors.length > 0 && form.targetLocationId && <option value="" disabled>—</option>}
              {/* Location options are loaded via the hierarchy; use the roster's locations */}
              {Array.from(new Set(employees.map((e) => e.locationId).filter(Boolean))).map((locId) => (
                <option key={locId as string} value={locId as string}>{locId as string}</option>
              ))}
            </select>
          </div>

          {/* Target floor */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Target Floor</label>
            <select
              value={form.targetFloorId}
              onChange={(e) => setForm((p) => ({ ...p, targetFloorId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white focus:ring-2 focus:ring-[#1346a1] focus:border-transparent"
            >
              <option value="">Select floor…</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Target department */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Target Department</label>
            <select
              value={form.targetDepartmentId}
              onChange={(e) => setForm((p) => ({ ...p, targetDepartmentId: e.target.value, targetSectionId: '', targetWorkAreaId: '' }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white focus:ring-2 focus:ring-[#1346a1] focus:border-transparent"
            >
              <option value="">Select department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Target section */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Target Section</label>
            <select
              value={form.targetSectionId}
              onChange={(e) => setForm((p) => ({ ...p, targetSectionId: e.target.value, targetWorkAreaId: '' }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white focus:ring-2 focus:ring-[#1346a1] focus:border-transparent"
            >
              <option value="">Select section…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Target work area */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Target Work Area</label>
            <select
              value={form.targetWorkAreaId}
              onChange={(e) => setForm((p) => ({ ...p, targetWorkAreaId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white focus:ring-2 focus:ring-[#1346a1] focus:border-transparent"
            >
              <option value="">Select work area…</option>
              {workAreas.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-[#0b1c30] dark:text-white mb-1">Reason *</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              rows={3}
              placeholder="Explain why this change is needed…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-[#0b1c30] dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-[#1346a1] focus:border-transparent resize-none"
              required
              minLength={5}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#1346a1] hover:bg-[#0e3882] shadow-md shadow-[#1346a1]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                  Submitting…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  Submit for Approval
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
