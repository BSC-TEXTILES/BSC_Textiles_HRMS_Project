'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2,
  MapPin, RefreshCw, ShieldCheck, Upload, X, Briefcase,
} from 'lucide-react';
import {
  HiringFormField, HiringFormSchema, PublicResolution, PublicSubmitResult,
  answerValue, stageMeta,
} from '@/lib/hiring';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');

function sessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('hiring_sid');
  if (!sid) {
    sid = ((crypto as any)?.randomUUID?.() as string) || `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('hiring_sid', sid);
  }
  return sid;
}

function evaluateCondition(condition: HiringFormField['conditional'], values: Record<string, unknown>): boolean {
  if (!condition?.fieldKey) return true;
  const actual = values[condition.fieldKey];
  const answered = actual !== undefined && actual !== null && !(typeof actual === 'string' && actual.trim() === '') && !(Array.isArray(actual) && actual.length === 0);
  const loose = (a: unknown, b: unknown) => {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na === nb;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  };
  switch (condition.operator) {
    case 'is_answered': return answered;
    case 'is_empty': return !answered;
    case 'equals': return loose(actual, condition.value);
    case 'not_equals': return !loose(actual, condition.value);
    case 'in': return Array.isArray(condition.value) && condition.value.some((v) => loose(actual, v));
    case 'not_in': return !(Array.isArray(condition.value) && condition.value.some((v) => loose(actual, v)));
    case 'contains':
      if (Array.isArray(actual)) return actual.some((v) => loose(v, condition.value));
      return answered && String(actual).toLowerCase().includes(String(condition.value).toLowerCase());
    case 'gt': return Number(actual) > Number(condition.value);
    case 'lt': return Number(actual) < Number(condition.value);
    default: return true;
  }
}

function validateField(field: HiringFormField, value: unknown, hasFile: boolean): string | null {
  const label = field.label || field.key;
  if (field.type === 'FILE' || field.type === 'PHOTO') {
    return field.required && !hasFile ? `${label} is required` : null;
  }
  const empty =
    value === undefined || value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);
  if (empty) {
    if (field.required) {
      if (field.type === 'CHECKBOX') return `Please tick ${label}`;
      return `${label} is required`;
    }
    return null;
  }
  if (field.type === 'CHECKBOX' && field.required && value !== true) return `Please tick ${label}`;
  const s = String(value).trim();
  const rules = field.validation || {};
  if (typeof value === 'string') {
    if (rules.minLength !== undefined && s.length < rules.minLength) return `${label} must be at least ${rules.minLength} characters`;
    if (rules.maxLength !== undefined && s.length > rules.maxLength) return `${label} is too long`;
    if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'Enter a valid email address';
    if (field.type === 'PHONE' && !/^[6-9]\d{9}$/.test(s.replace(/\D/g, '').slice(-10))) return 'Enter a valid 10-digit mobile number';
    if (field.type === 'AADHAAR' && !/^[2-9]\d{11}$/.test(s.replace(/\s|-/g, ''))) return 'Enter a valid 12-digit Aadhaar number';
    if (field.type === 'PAN' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(s.toUpperCase())) return 'Enter a valid PAN (e.g. ABCDE1234F)';
    if (rules.pattern === 'pincode' && !/^[1-9]\d{5}$/.test(s)) return 'Enter a valid 6-digit PIN code';
  }
  if ((field.type === 'NUMBER' || field.type === 'CURRENCY') && Number.isNaN(Number(value))) {
    return `${label} must be a number`;
  }
  return null;
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

export default function PublicApplyPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const code = params?.code;
  const formTokenParam = searchParams?.get('token') || undefined;
  const source = searchParams?.get('source') || 'PUBLIC_LINK';

  const [resolution, setResolution] = useState<PublicResolution | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<{ code?: string; message: string } | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, { token: string; name: string; sizeBytes: number }>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState('');
  const [consent, setConsent] = useState(false);

  const [captcha, setCaptcha] = useState<{ captchaId: string; svg: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicSubmitResult | null>(null);

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const res = await fetch(`${API_BASE}/hiring/public/captcha`, { credentials: 'omit' });
      if (res.ok) {
        const data = await res.json();
        setCaptcha({ captchaId: data.captchaId, svg: data.svg });
        setCaptchaAnswer('');
      }
    } catch {
      /* the captcha can be retried from the button */
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setLoadState('loading');
      try {
        const url = formTokenParam
          ? `${API_BASE}/hiring/public/forms/${encodeURIComponent(formTokenParam)}`
          : `${API_BASE}/hiring/public/links/${encodeURIComponent(code)}`;
        const res = await fetch(url, { headers: { 'x-hiring-session': sessionId() }, credentials: 'omit' });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setLoadError({ code: data?.code, message: data?.error || 'This application link is not available.' });
          setLoadState('error');
          return;
        }
        setResolution(data as PublicResolution);
        setLocationId(data.link?.locationId || (data.locations?.length === 1 ? data.locations[0].id : ''));
        setLoadState('ready');
        if (!formTokenParam) {
          fetch(`${API_BASE}/hiring/public/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-hiring-session': sessionId() },
            body: JSON.stringify({ linkCode: code, source, sessionId: sessionId() }),
            credentials: 'omit',
          }).catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setLoadError({ message: 'Could not reach the application server. Check your connection and try again.' });
          setLoadState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, formTokenParam, source]);

  useEffect(() => {
    if (resolution?.settings.requireCaptcha && !captcha) fetchCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution]);

  const schema: HiringFormSchema | null = resolution?.schema ?? null;
  const steps = useMemo(() => schema?.steps ?? [], [schema]);
  const currentStep = steps[stepIndex];
  const primaryColor = resolution?.settings.primaryColor || '#0f766e';
  const schemaConsentKey = useMemo(
    () => steps.flatMap((s) => s.fields).find((f) => f.type === 'CHECKBOX' && f.key === 'consent')?.key ?? null,
    [steps],
  );
  const consentGiven = schemaConsentKey ? values[schemaConsentKey] === true : consent;

  const visibleStepFields = useMemo(() => {
    if (!currentStep) return [];
    return currentStep.fields.filter((field) => evaluateCondition(field.conditional, values));
  }, [currentStep, values]);

  const setValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const uploadFile = async (field: HiringFormField, file: File) => {
    if (!resolution) return;
    const maxMb = field.validation?.maxSizeMB ?? 5;
    if (file.size > maxMb * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, [field.key]: `File exceeds the ${maxMb} MB limit` }));
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const accept = field.validation?.accept || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
    if (!accept.includes(ext)) {
      setFieldErrors((prev) => ({ ...prev, [field.key]: `Allowed types: ${accept.join(', ')}` }));
      return;
    }
    setUploadingField(field.key);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
    try {
      const res = await fetch(`${API_BASE}/hiring/public/upload`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-form-token': resolution.form.publicToken,
          'x-field-key': field.key,
          'x-file-name': encodeURIComponent(file.name),
          ...(field.type === 'PHOTO' ? { 'x-photo': '1' } : {}),
        },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        setFieldErrors((prev) => ({ ...prev, [field.key]: data?.error || 'Upload failed — try again' }));
        return;
      }
      setFiles((prev) => ({ ...prev, [field.key]: { token: data.token, name: data.fileName || file.name, sizeBytes: data.sizeBytes || file.size } }));
    } catch {
      setFieldErrors((prev) => ({ ...prev, [field.key]: 'Upload failed — check your connection' }));
    } finally {
      setUploadingField(null);
    }
  };

  const validateStep = (index: number): boolean => {
    if (!steps[index]) return true;
    const errors: Record<string, string> = {};
    for (const field of steps[index].fields) {
      if (!evaluateCondition(field.conditional, values)) continue;
      const error = validateField(field, values[field.key], Boolean(files[field.key]));
      if (error) errors[field.key] = error;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const next = () => {
    if (!validateStep(stepIndex)) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const submit = async () => {
    if (!resolution || !schema) return;
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(i)) {
        setStepIndex(i);
        return;
      }
    }
    if (resolution.locations.length > 1 && !locationId) {
      setSubmitError('Choose the store you are applying to');
      return;
    }
    if (!consentGiven) {
      setSubmitError('Please accept the consent statement to submit');
      return;
    }
    if (resolution.settings.requireCaptcha && (!captcha || !captchaAnswer.trim())) {
      setSubmitError('Please complete the captcha verification');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/hiring/public/apply`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'x-hiring-session': sessionId() },
        body: JSON.stringify({
          linkCode: formTokenParam ? null : code,
          formToken: formTokenParam || null,
          locationId: locationId || resolution.link?.locationId || null,
          values,
          files: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, value.token])),
          consent: true,
          captcha: captcha ? { id: captcha.captchaId, answer: captchaAnswer.trim() } : null,
          sessionId: sessionId(),
          source,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === 'CAPTCHA_INVALID' || data?.code === 'CAPTCHA_EXPIRED') {
          fetchCaptcha();
        }
        if (data?.code === 'VALIDATION_FAILED' && data?.details?.errors) {
          setFieldErrors(data.details.errors);
          setSubmitError('Please fix the highlighted fields');
        } else {
          setSubmitError(data?.error || 'Submission failed. Please try again.');
        }
        return;
      }
      setResult(data as PublicSubmitResult);
    } catch {
      setSubmitError('Could not submit — check your internet connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------- rendering

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm">Opening the application form…</p>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !resolution) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Application unavailable</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{loadError?.message}</p>
          <p className="mt-1 text-xs text-slate-400">
            {loadError?.code === 'LINK_EXPIRED' || loadError?.code === 'FORM_CLOSED'
              ? 'This opening is no longer accepting applications.'
              : 'Ask the store for a fresh QR code or link.'}
          </p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Application received</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Thank you{values.fullName ? `, ${String(values.fullName)}` : ''}. Your application for{' '}
            <strong>{resolution.form.jobTitle || resolution.form.title}</strong> has been submitted.
          </p>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reference number</p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">{result.referenceNumber}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Status: {stageMeta(result.stage).label} · Keep this number for any follow-up.
            </p>
          </div>
          <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
            {resolution.settings.companyName} HR will contact you on your registered mobile number if you are shortlisted.
          </p>
        </div>
      </div>
    );
  }

  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="px-4 pb-10 pt-8 text-white" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}>
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">{resolution.settings.companyName} · Careers</p>
          <h1 className="mt-2 text-2xl font-bold">{resolution.form.jobTitle || resolution.form.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-90">
            {resolution.form.openings > 0 && <span>{resolution.form.openings} position{resolution.form.openings === 1 ? '' : 's'}</span>}
            {resolution.form.qualification && <span>{resolution.form.qualification}</span>}
            {resolution.form.experienceLevel && <span>{resolution.form.experienceLevel}</span>}
            {(resolution.form.salaryMin || resolution.form.salaryMax) && (
              <span>₹{resolution.form.salaryMin ?? '—'}–{resolution.form.salaryMax ?? '—'} / month</span>
            )}
          </div>
          {resolution.form.jobDescription && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-90">{resolution.form.jobDescription}</p>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-2xl px-4 pb-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          {steps.length > 1 && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>Step {stepIndex + 1} of {steps.length}</span>
                <span>{Math.round(((stepIndex + 1) / steps.length) * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%`, backgroundColor: primaryColor }} />
              </div>
            </div>
          )}

          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{currentStep?.title}</h2>
          {currentStep?.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{currentStep.description}</p>}

          <div className="mt-5 grid grid-cols-6 gap-4">
            {visibleStepFields.map((field) => {
              const error = fieldErrors[field.key];
              const span = field.width === 'full' ? 'col-span-6' : field.width === 'third' ? 'col-span-6 sm:col-span-2' : 'col-span-6 sm:col-span-3';
              const value = values[field.key];
              return (
                <div key={field.key} className={span}>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {field.label}
                    {field.required && <span className="ml-0.5 text-red-500">*</span>}
                  </label>

                  {(field.type === 'TEXT' || field.type === 'EMAIL' || field.type === 'PHONE' || field.type === 'AADHAAR' || field.type === 'PAN' || field.type === 'URL' || field.type === 'CURRENCY') && (
                    <input
                      type={field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'}
                      inputMode={field.type === 'PHONE' || field.type === 'AADHAAR' || field.type === 'CURRENCY' ? 'numeric' : undefined}
                      placeholder={field.placeholder}
                      value={(value as string) ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={inputClass}
                    />
                  )}

                  {field.type === 'NUMBER' && (
                    <input
                      type="number"
                      min={field.validation?.min}
                      max={field.validation?.max}
                      placeholder={field.placeholder}
                      value={(value as string) ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={inputClass}
                    />
                  )}

                  {field.type === 'TEXTAREA' && (
                    <textarea
                      rows={4}
                      placeholder={field.placeholder}
                      value={(value as string) ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={inputClass}
                    />
                  )}

                  {field.type === 'DATE' && (
                    <input
                      type="date"
                      max={field.validation?.maxDate === 'today' ? new Date().toISOString().slice(0, 10) : field.validation?.maxDate}
                      value={(value as string) ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={inputClass}
                    />
                  )}

                  {(field.type === 'SELECT' || field.type === 'YES_NO') && (
                    <select
                      value={(value as string) ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select…</option>
                      {(field.type === 'YES_NO'
                        ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
                        : field.options || []
                      ).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  )}

                  {field.type === 'RADIO' && (
                    <div className="flex flex-wrap gap-2">
                      {(field.options || []).map((option) => {
                        const active = value === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setValue(field.key, option.value)}
                            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                              active ? 'border-transparent text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300'
                            }`}
                            style={active ? { backgroundColor: primaryColor } : undefined}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {field.type === 'MULTISELECT' && (
                    <div className="flex flex-wrap gap-2">
                      {(field.options || []).map((option) => {
                        const selectedValues = Array.isArray(value) ? (value as string[]) : [];
                        const active = selectedValues.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setValue(
                                field.key,
                                active ? selectedValues.filter((v) => v !== option.value) : [...selectedValues, option.value],
                              )
                            }
                            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                              active ? 'border-transparent text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300'
                            }`}
                            style={active ? { backgroundColor: primaryColor } : undefined}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {field.type === 'CHECKBOX' && (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(e) => setValue(field.key, e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-600"
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-300">{field.helpText || field.label}</span>
                    </label>
                  )}

                  {(field.type === 'FILE' || field.type === 'PHOTO') && (
                    <div>
                      {files[field.key] ? (
                        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
                          <span className="truncate text-sm text-emerald-800 dark:text-emerald-200">
                            {files[field.key].name} · {(files[field.key].sizeBytes / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() => setFiles((prev) => { const next = { ...prev }; delete next[field.key]; return next; })}
                            className="ml-2 shrink-0 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 transition-colors hover:border-teal-500 hover:text-teal-700 dark:border-slate-600 dark:text-slate-400">
                          {uploadingField === field.key ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                          ) : (
                            <><Upload className="h-4 w-4" /> {field.type === 'PHOTO' ? 'Upload photo' : 'Upload file'}{field.validation?.accept ? ` (${field.validation.accept.join(', ')})` : ''}</>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept={(field.validation?.accept || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']).map((e) => `.${e}`).join(',')}
                            disabled={uploadingField === field.key}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadFile(field, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {field.helpText && field.type !== 'CHECKBOX' && (
                    <p className="mt-1 text-[11px] text-slate-400">{field.helpText}</p>
                  )}
                  {error && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
                </div>
              );
            })}
          </div>

          {isLastStep && (
            <div className="mt-6 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
              {resolution.locations.length > 0 && !resolution.link?.locationId && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <MapPin className="h-4 w-4" /> Preferred store / location *
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {resolution.locations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setLocationId(loc.id)}
                        className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                          locationId === loc.id
                            ? 'border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-semibold">{loc.code}</span> — {loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!schemaConsentKey && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => { setConsent(e.target.checked); setSubmitError(null); }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-600"
                  />
                  <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {resolution.settings.consentText}
                    {resolution.settings.privacyPolicyUrl && (
                      <>
                        {' '}See the{' '}
                        <a href={resolution.settings.privacyPolicyUrl} target="_blank" rel="noreferrer" className="underline">
                          privacy policy
                        </a>.
                      </>
                    )}
                  </span>
                </label>
              )}

              {resolution.settings.requireCaptcha && (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <ShieldCheck className="h-4 w-4" /> Verification *
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {captcha ? (
                      <span
                        className="overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-600"
                        dangerouslySetInnerHTML={{ __html: captcha.svg }}
                      />
                    ) : (
                      <span className="flex h-14 w-44 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                        {captchaLoading ? 'Loading…' : 'Unavailable'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={fetchCaptcha}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${captchaLoading ? 'animate-spin' : ''}`} /> New code
                    </button>
                    <input
                      type="text"
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      placeholder="Enter the code"
                      className={`${inputClass} w-44`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {submitError}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0 || submitting}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {isLastStep ? (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit application'}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1 rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
          <Briefcase className="h-3 w-3" /> Powered by {resolution.settings.companyName} HRMS · Your data is stored securely and used only for recruitment.
        </p>
      </main>
    </div>
  );
}
