'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, Rocket,
  Eye, Copy, Archive, ArchiveRestore, Lock, Unlock, Share2, History, GripVertical,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { HireError } from '@/components/hiring/HireError';
import { LinksModal } from '@/components/hiring/LinksModal';
import {
  EMPLOYMENT_TYPES, FIELD_TYPES, FILE_FIELD_TYPES, HiringFormDetail, HiringFormField,
  HiringFormSchema, HiringFormStep, HiringLocation, OPTION_FIELD_TYPES, toFieldKey,
} from '@/lib/hiring';

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function emptySchema(): HiringFormSchema {
  return {
    version: 1,
    steps: [
      {
        key: 'personal',
        title: 'Personal Details',
        fields: [
          { key: 'fullName', type: 'TEXT', label: 'Full Name', required: true, width: 'half' },
          { key: 'phone', type: 'PHONE', label: 'Mobile Number', required: true, width: 'half' },
        ],
      },
    ],
  };
}

function validateSchema(schema: HiringFormSchema): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!schema.steps.length) errors.push('Add at least one step');
  schema.steps.forEach((step, i) => {
    if (!step.title?.trim()) errors.push(`Step ${i + 1}: title is required`);
    if (!KEY_PATTERN.test(step.key)) errors.push(`Step ${i + 1}: step key "${step.key}" is invalid`);
    if (!step.fields.length) errors.push(`${step.title || `Step ${i + 1}`}: add at least one field`);
    step.fields.forEach((field) => {
      const label = field.label || field.key || 'field';
      if (!field.label?.trim()) errors.push(`${label}: field needs a label`);
      if (!KEY_PATTERN.test(field.key)) errors.push(`"${field.key}" is not a valid key (letters, digits, underscore; start with a letter)`);
      if (seen.has(field.key)) errors.push(`Duplicate field key "${field.key}"`);
      seen.add(field.key);
      if (OPTION_FIELD_TYPES.includes(field.type) && (!field.options || field.options.length === 0)) {
        errors.push(`${label}: add at least one option`);
      }
    });
  });
  return errors;
}

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const formId = params?.id;

  const [form, setForm] = useState<HiringFormDetail | null>(null);
  const [locations, setLocations] = useState<HiringLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const [meta, setMeta] = useState({
    title: '', jobTitle: '', employmentType: 'FULL_TIME', openings: '1', qualification: '',
    experienceLevel: '', salaryMin: '', salaryMax: '', jobDescription: '', allowOtherLocations: false,
  });
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [schema, setSchema] = useState<HiringFormSchema>(emptySchema());
  const [dirtySchema, setDirtySchema] = useState(false);
  const [dirtyMeta, setDirtyMeta] = useState(false);
  const [changelog, setChangelog] = useState('');

  const load = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const res = await api.get(`/hiring/forms/${formId}`);
      const detail: HiringFormDetail = res.data;
      setForm(detail);
      setMeta({
        title: detail.title || '',
        jobTitle: detail.jobTitle || '',
        employmentType: detail.employmentType || 'FULL_TIME',
        openings: String(detail.openings ?? 1),
        qualification: detail.qualification || '',
        experienceLevel: detail.experienceLevel || '',
        salaryMin: detail.salaryMin != null ? String(detail.salaryMin) : '',
        salaryMax: detail.salaryMax != null ? String(detail.salaryMax) : '',
        jobDescription: detail.jobDescription || '',
        allowOtherLocations: Boolean(detail.allowOtherLocations),
      });
      setLocationIds(detail.locationIds || []);
      const nextSchema = detail.draft?.schema ?? detail.published?.schema ?? emptySchema();
      setSchema(JSON.parse(JSON.stringify(nextSchema)));
      setDirtySchema(false);
      setDirtyMeta(false);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load the opening');
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/hiring/locations').then((res) => setLocations(Array.isArray(res.data) ? res.data : [])).catch(() => undefined);
  }, []);

  const mutateSchema = (fn: (draft: HiringFormSchema) => void) => {
    setSchema((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as HiringFormSchema;
      fn(next);
      return next;
    });
    setDirtySchema(true);
  };

  const addStep = () =>
    mutateSchema((draft) => {
      draft.steps.push({
        key: `step_${draft.steps.length + 1}`,
        title: `Step ${draft.steps.length + 1}`,
        fields: [],
      });
    });

  const removeStep = (index: number) => {
    if (!confirm('Remove this step and all its fields?')) return;
    mutateSchema((draft) => draft.steps.splice(index, 1));
  };

  const moveStep = (index: number, dir: -1 | 1) =>
    mutateSchema((draft) => {
      const target = index + dir;
      if (target < 0 || target >= draft.steps.length) return;
      [draft.steps[index], draft.steps[target]] = [draft.steps[target], draft.steps[index]];
    });

  const addField = (stepIndex: number) =>
    mutateSchema((draft) => {
      const step = draft.steps[stepIndex];
      const n = step.fields.length + 1;
      const key = `field_${n}`;
      step.fields.push({ key, type: 'TEXT', label: `Field ${n}`, width: 'half', required: false });
    });

  const updateField = (stepIndex: number, fieldIndex: number, patch: Partial<HiringFormField>) =>
    mutateSchema((draft) => {
      Object.assign(draft.steps[stepIndex].fields[fieldIndex], patch);
    });

  const updateFieldType = (stepIndex: number, fieldIndex: number, type: HiringFormField['type']) =>
    mutateSchema((draft) => {
      const field = draft.steps[stepIndex].fields[fieldIndex];
      field.type = type;
      if (OPTION_FIELD_TYPES.includes(type) && (!field.options || field.options.length === 0)) {
        field.options = [{ value: 'OPTION_1', label: 'Option 1' }];
      }
      if (!OPTION_FIELD_TYPES.includes(type)) delete field.options;
      if (FILE_FIELD_TYPES.includes(type)) {
        field.validation = { accept: type === 'PHOTO' ? ['jpg', 'jpeg', 'png'] : ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'], maxSizeMB: type === 'PHOTO' ? 2 : 5 };
      }
    });

  const removeField = (stepIndex: number, fieldIndex: number) =>
    mutateSchema((draft) => draft.steps[stepIndex].fields.splice(fieldIndex, 1));

  const moveField = (stepIndex: number, fieldIndex: number, dir: -1 | 1) =>
    mutateSchema((draft) => {
      const fields = draft.steps[stepIndex].fields;
      const target = fieldIndex + dir;
      if (target < 0 || target >= fields.length) return;
      [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
    });

  const addOption = (stepIndex: number, fieldIndex: number) =>
    mutateSchema((draft) => {
      const field = draft.steps[stepIndex].fields[fieldIndex];
      const options = field.options ?? [];
      const n = options.length + 1;
      field.options = [...options, { value: `OPTION_${n}`, label: `Option ${n}` }];
    });

  const updateOption = (stepIndex: number, fieldIndex: number, optionIndex: number, patch: { value?: string; label?: string }) =>
    mutateSchema((draft) => {
      const option = draft.steps[stepIndex].fields[fieldIndex].options![optionIndex];
      Object.assign(option, patch);
      if (patch.label !== undefined && (option.value.startsWith('OPTION_') || !option.value)) {
        option.value = toFieldKey(patch.label).toUpperCase() || option.value;
      }
    });

  const removeOption = (stepIndex: number, fieldIndex: number, optionIndex: number) =>
    mutateSchema((draft) => {
      draft.steps[stepIndex].fields[fieldIndex].options?.splice(optionIndex, 1);
    });

  const saveDraft = async () => {
    const errors = validateSchema(schema);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/hiring/forms/${formId}/versions`, { schema, changelog: changelog.trim() || undefined });
      toast.success('Draft saved');
      setChangelog('');
      setDirtySchema(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save the draft');
    } finally {
      setBusy(false);
    }
  };

  const saveMeta = async () => {
    if (!meta.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (locationIds.length === 0 && !meta.allowOtherLocations) {
      toast.error('Select at least one hiring location');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/hiring/forms/${formId}`, {
        title: meta.title.trim(),
        jobTitle: meta.jobTitle.trim() || null,
        employmentType: meta.employmentType,
        openings: Number(meta.openings) || 1,
        qualification: meta.qualification.trim() || null,
        experienceLevel: meta.experienceLevel.trim() || null,
        salaryMin: meta.salaryMin ? Number(meta.salaryMin) : null,
        salaryMax: meta.salaryMax ? Number(meta.salaryMax) : null,
        jobDescription: meta.jobDescription.trim() || null,
        locationIds,
        allowOtherLocations: meta.allowOtherLocations,
      });
      toast.success('Opening details saved');
      setDirtyMeta(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save details');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (dirtySchema) {
      toast.error('Save the draft first, then publish');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/hiring/forms/${formId}/publish`);
      toast.success('Opening published');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to publish');
    } finally {
      setBusy(false);
    }
  };

  const action = async (path: string, success: string) => {
    setBusy(true);
    try {
      await api.post(`/hiring/forms/${formId}/${path}`);
      toast.success(success);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/hiring/forms/${formId}/duplicate`);
      toast.success('Opening duplicated');
      router.push(`/hiring/forms/${res.data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to duplicate');
    } finally {
      setBusy(false);
    }
  };

  const locationMap = useMemo(() => {
    const map = new Map<string, HiringLocation>();
    locations.forEach((l) => map.set(l.id, l));
    return map;
  }, [locations]);

  if (loading && !form) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !form) {
    return (
      <DashboardLayout>
        <HireError message={error || 'Opening not found'} onRetry={load} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/hiring/forms')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{form.title}</h1>
                <Badge variant={form.status === 'PUBLISHED' ? 'success' : form.status === 'DRAFT' ? 'gray' : form.status === 'CLOSED' ? 'warning' : 'neutral'} dot>
                  {form.status.toLowerCase()}
                </Badge>
                {dirtySchema && <Badge variant="warning">unsaved schema</Badge>}
                {dirtyMeta && <Badge variant="warning">unsaved details</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Version {form.published?.version ?? form.draft?.version ?? 0} · {locationIds.map((id) => locationMap.get(id)?.code || '?').join(', ')} · {form.openings} opening{form.openings === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setPreview((p) => !p)}>
              <Eye className="h-3.5 w-3.5" /> {preview ? 'Edit form' : 'Preview'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowVersions((v) => !v)}>
              <History className="h-3.5 w-3.5" /> Versions ({form.versions.length})
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShareOpen(true)}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={duplicate} disabled={busy}>
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            {form.status === 'PUBLISHED' ? (
              <Button size="sm" variant="outline" className="gap-1 text-amber-700" onClick={() => action('close', 'Opening closed')} disabled={busy}>
                <Lock className="h-3.5 w-3.5" /> Close
              </Button>
            ) : form.status === 'CLOSED' ? (
              <Button size="sm" variant="outline" className="gap-1 text-emerald-700" onClick={() => action('reopen', 'Opening reopened')} disabled={busy}>
                <Unlock className="h-3.5 w-3.5" /> Reopen
              </Button>
            ) : null}
            {form.status === 'ARCHIVED' ? (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => action('unarchive', 'Opening restored')} disabled={busy}>
                <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => action('archive', 'Opening archived')} disabled={busy}>
                <Archive className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" className="gap-1" onClick={publish} disabled={busy || dirtySchema}>
              <Rocket className="h-3.5 w-3.5" /> Publish
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {preview ? (
              <Card className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{form.jobTitle || form.title}</h2>
                {form.jobDescription && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{form.jobDescription}</p>}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Badge variant="info">{form.employmentType.replace('_', ' ').toLowerCase()}</Badge>
                  {form.qualification && <Badge variant="neutral">{form.qualification}</Badge>}
                  {form.experienceLevel && <Badge variant="neutral">{form.experienceLevel}</Badge>}
                  {(form.salaryMin || form.salaryMax) && (
                    <Badge variant="success">₹{form.salaryMin ?? 0}–{form.salaryMax ?? '—'} / month</Badge>
                  )}
                </div>
                {schema.steps.map((step) => (
                  <div key={step.key} className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                    {step.description && <p className="text-xs text-slate-500">{step.description}</p>}
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {step.fields.map((field) => (
                        <div key={field.key} className={field.width === 'full' ? 'col-span-2' : ''}>
                          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                          </label>
                          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                            {OPTION_FIELD_TYPES.includes(field.type)
                              ? `Choice: ${(field.options || []).map((o) => o.label).join(', ') || 'no options'}`
                              : FILE_FIELD_TYPES.includes(field.type)
                              ? `Upload (${field.validation?.accept?.join(', ') || 'any'})`
                              : `${field.type} input`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <>
                <Card className="rounded-xl border border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">Application form builder</h2>
                    <Button size="sm" variant="outline" className="gap-1" onClick={addStep}>
                      <Plus className="h-3.5 w-3.5" /> Add step
                    </Button>
                  </div>
                  <div className="space-y-5 p-5">
                    {schema.steps.map((step, stepIndex) => (
                      <div key={stepIndex} className="rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                          <GripVertical className="h-4 w-4 text-slate-300" />
                          <input
                            value={step.title}
                            onChange={(e) => mutateSchema((draft) => { draft.steps[stepIndex].title = e.target.value; })}
                            className="w-48 rounded border border-transparent px-2 py-1 text-sm font-semibold text-slate-900 hover:border-slate-200 focus:border-[#1346a1] focus:outline-none dark:text-white dark:hover:border-slate-700"
                          />
                          <input
                            value={step.key}
                            onChange={(e) => mutateSchema((draft) => { draft.steps[stepIndex].key = e.target.value; })}
                            className="w-32 rounded border border-transparent px-2 py-1 font-mono text-xs text-slate-500 hover:border-slate-200 focus:border-[#1346a1] focus:outline-none dark:hover:border-slate-700"
                          />
                          <div className="ml-auto flex items-center gap-0.5">
                            <Button size="xs" variant="ghost" onClick={() => moveStep(stepIndex, -1)} disabled={stepIndex === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                            <Button size="xs" variant="ghost" onClick={() => moveStep(stepIndex, 1)} disabled={stepIndex === schema.steps.length - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
                            <Button size="xs" variant="ghost" className="text-red-600" onClick={() => removeStep(stepIndex)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>

                        <div className="space-y-2 p-3">
                          {step.fields.map((field, fieldIndex) => (
                            <div key={fieldIndex} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <Input
                                  label="Label"
                                  value={field.label}
                                  onChange={(e) => updateField(stepIndex, fieldIndex, { label: e.target.value })}
                                />
                                <Input
                                  label="Key"
                                  value={field.key}
                                  onChange={(e) => updateField(stepIndex, fieldIndex, { key: e.target.value })}
                                  className="font-mono text-xs"
                                />
                                <Select
                                  label="Type"
                                  value={field.type}
                                  onChange={(e) => updateFieldType(stepIndex, fieldIndex, e.target.value as any)}
                                  options={FIELD_TYPES.map((t) => ({ value: t, label: t }))}
                                />
                                <Select
                                  label="Width"
                                  value={field.width || 'half'}
                                  onChange={(e) => updateField(stepIndex, fieldIndex, { width: e.target.value as any })}
                                  options={[
                                    { value: 'full', label: 'Full width' },
                                    { value: 'half', label: 'Half width' },
                                    { value: 'third', label: 'One third' },
                                  ]}
                                />
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                                <label className="flex cursor-pointer items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(field.required)}
                                    onChange={(e) => updateField(stepIndex, fieldIndex, { required: e.target.checked })}
                                    className="h-3.5 w-3.5 rounded border-gray-300 text-[#1346a1]"
                                  />
                                  Required
                                </label>
                                {OPTION_FIELD_TYPES.includes(field.type) && (
                                  <button
                                    type="button"
                                    onClick={() => addOption(stepIndex, fieldIndex)}
                                    className="inline-flex items-center gap-1 font-medium text-[#1346a1] hover:underline"
                                  >
                                    <Plus className="h-3 w-3" /> Add option
                                  </button>
                                )}
                                <div className="ml-auto flex items-center gap-0.5">
                                  <Button size="xs" variant="ghost" onClick={() => moveField(stepIndex, fieldIndex, -1)} disabled={fieldIndex === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                                  <Button size="xs" variant="ghost" onClick={() => moveField(stepIndex, fieldIndex, 1)} disabled={fieldIndex === step.fields.length - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
                                  <Button size="xs" variant="ghost" className="text-red-600" onClick={() => removeField(stepIndex, fieldIndex)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </div>
                              </div>
                              {OPTION_FIELD_TYPES.includes(field.type) && (
                                <div className="mt-2 space-y-1.5">
                                  {(field.options || []).map((option, optionIndex) => (
                                    <div key={optionIndex} className="flex items-center gap-2">
                                      <input
                                        value={option.label}
                                        onChange={(e) => updateOption(stepIndex, fieldIndex, optionIndex, { label: e.target.value })}
                                        className="w-48 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                                        placeholder="Option label"
                                      />
                                      <span className="font-mono text-[10px] text-slate-400">{option.value}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeOption(stepIndex, fieldIndex, optionIndex)}
                                        className="text-red-500 hover:text-red-700"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          <Button size="xs" variant="outline" className="gap-1" onClick={() => addField(stepIndex)}>
                            <Plus className="h-3 w-3" /> Add field
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                    <Input
                      placeholder="Changelog (optional) — e.g. Added experience section"
                      value={changelog}
                      onChange={(e) => setChangelog(e.target.value)}
                      className="w-72"
                    />
                    <Button size="sm" className="gap-1" onClick={saveDraft} loading={busy} disabled={!dirtySchema}>
                      <Save className="h-3.5 w-3.5" /> Save draft
                    </Button>
                    <Button size="sm" variant="success" className="gap-1" onClick={publish} loading={busy} disabled={dirtySchema}>
                      <Rocket className="h-3.5 w-3.5" /> Publish draft
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>

          <div className="space-y-6">
            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Opening details</h2>
              <div className="mt-3 space-y-3">
                <Input label="Title *" value={meta.title} onChange={(e) => { setMeta({ ...meta, title: e.target.value }); setDirtyMeta(true); }} />
                <Input label="Job title" value={meta.jobTitle} onChange={(e) => { setMeta({ ...meta, jobTitle: e.target.value }); setDirtyMeta(true); }} />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="Employment type"
                    value={meta.employmentType}
                    onChange={(e) => { setMeta({ ...meta, employmentType: e.target.value }); setDirtyMeta(true); }}
                    options={EMPLOYMENT_TYPES}
                  />
                  <Input label="Openings" type="number" min={1} value={meta.openings} onChange={(e) => { setMeta({ ...meta, openings: e.target.value }); setDirtyMeta(true); }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Salary min (₹)" type="number" value={meta.salaryMin} onChange={(e) => { setMeta({ ...meta, salaryMin: e.target.value }); setDirtyMeta(true); }} />
                  <Input label="Salary max (₹)" type="number" value={meta.salaryMax} onChange={(e) => { setMeta({ ...meta, salaryMax: e.target.value }); setDirtyMeta(true); }} />
                </div>
                <Input label="Qualification" value={meta.qualification} onChange={(e) => { setMeta({ ...meta, qualification: e.target.value }); setDirtyMeta(true); }} />
                <Input label="Experience level" value={meta.experienceLevel} onChange={(e) => { setMeta({ ...meta, experienceLevel: e.target.value }); setDirtyMeta(true); }} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Job description</label>
                  <textarea
                    rows={3}
                    value={meta.jobDescription}
                    onChange={(e) => { setMeta({ ...meta, jobDescription: e.target.value }); setDirtyMeta(true); }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#1346a1] focus:outline-none focus:ring-1 focus:ring-[#1346a1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-200">Hiring locations</p>
                  <div className="space-y-1.5">
                    {locations.map((loc) => (
                      <label key={loc.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={locationIds.includes(loc.id)}
                          onChange={() => {
                            setLocationIds((prev) => (prev.includes(loc.id) ? prev.filter((x) => x !== loc.id) : [...prev, loc.id]));
                            setDirtyMeta(true);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
                        />
                        {loc.code} — {loc.name}
                      </label>
                    ))}
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={meta.allowOtherLocations}
                      onChange={(e) => { setMeta({ ...meta, allowOtherLocations: e.target.checked }); setDirtyMeta(true); }}
                      className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
                    />
                    Accept other locations
                  </label>
                </div>
                <Button size="sm" className="w-full gap-1" onClick={saveMeta} loading={busy} disabled={!dirtyMeta}>
                  <Save className="h-3.5 w-3.5" /> Save details
                </Button>
              </div>
            </Card>

            {showVersions && (
              <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Version history</h2>
                <div className="mt-3 space-y-2">
                  {[...form.versions].reverse().map((version) => (
                    <div key={version.id} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">v{version.version}</span>
                        {version.isDraft ? <Badge variant="warning">draft</Badge> : <Badge variant="success">published</Badge>}
                      </div>
                      {version.changelog && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{version.changelog}</p>}
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {version.publishedAt ? `published ${new Date(version.publishedAt).toLocaleString()}` : `created ${new Date(version.createdAt).toLocaleString()}`}
                      </p>
                    </div>
                  ))}
                  {form.versions.length === 0 && <p className="text-xs text-slate-400">No saved versions yet.</p>}
                </div>
              </Card>
            )}

            <Card className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Share links</h2>
              <div className="mt-3 space-y-2">
                {form.links.length === 0 && <p className="text-xs text-slate-400">No links yet — use Share to create one.</p>}
                {form.links.map((link) => (
                  <div key={link.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{link.code}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{link.label || 'Untitled'} · {link.submissions} submissions</p>
                    </div>
                    <Badge variant={link.enabled ? 'success' : 'neutral'} dot>{link.enabled ? 'active' : 'off'}</Badge>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full gap-1" onClick={() => setShareOpen(true)}>
                  <Share2 className="h-3.5 w-3.5" /> Manage share links
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <LinksModal
        open={shareOpen}
        onClose={() => { setShareOpen(false); load(); }}
        formId={form.id}
        formTitle={form.title}
        locationIds={form.locationIds}
        allowOtherLocations={Boolean(form.allowOtherLocations)}
        locations={locations}
      />
    </DashboardLayout>
  );
}
