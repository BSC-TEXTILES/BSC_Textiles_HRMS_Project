/**
 * Candidate Hiring — shared frontend types, constants and helpers.
 *
 * Mirrors the backend contracts in `backend/src/services/hiring/*` (route
 * shapes captured from the live API). Pure data + formatting only; every
 * request still goes through `lib/api.ts` so auth/CSRF/interceptors apply.
 */

// ---------------------------------------------------------------------------
// Stages & pipeline
// ---------------------------------------------------------------------------

export const APPLICATION_STAGES = [
  'NEW',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWED',
  'SELECTED',
  'OFFERED',
  'OFFER_ACCEPTED',
  'HIRED',
  'ON_HOLD',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Ordered the way the Kanban renders columns (closed stages excluded). */
export const ACTIVE_STAGES: ApplicationStage[] = [
  'NEW',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWED',
  'SELECTED',
  'OFFERED',
  'OFFER_ACCEPTED',
  'HIRED',
  'ON_HOLD',
];

export const CLOSED_STAGES: ApplicationStage[] = ['REJECTED', 'WITHDRAWN'];

export const TERMINAL_STAGES: ApplicationStage[] = ['HIRED', 'REJECTED', 'WITHDRAWN'];

export function isTerminalStage(stage: string): boolean {
  return (TERMINAL_STAGES as string[]).includes(stage);
}

export interface StageMeta {
  label: string;
  /** Badge variant from components/ui/Badge. */
  badge: 'info' | 'warning' | 'success' | 'danger' | 'gray' | 'primary' | 'neutral';
  /** Kanban / dot accent. */
  dot: string;
  /** Soft background for kanban column headers. */
  soft: string;
}

export const STAGE_META: Record<ApplicationStage, StageMeta> = {
  NEW: { label: 'New', badge: 'info', dot: 'bg-blue-500', soft: 'bg-blue-50 border-blue-200' },
  SCREENING: { label: 'Screening', badge: 'warning', dot: 'bg-amber-500', soft: 'bg-amber-50 border-amber-200' },
  SHORTLISTED: { label: 'Shortlisted', badge: 'primary', dot: 'bg-indigo-500', soft: 'bg-indigo-50 border-indigo-200' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', badge: 'info', dot: 'bg-cyan-500', soft: 'bg-cyan-50 border-cyan-200' },
  INTERVIEWED: { label: 'Interviewed', badge: 'primary', dot: 'bg-violet-500', soft: 'bg-violet-50 border-violet-200' },
  SELECTED: { label: 'Selected', badge: 'success', dot: 'bg-emerald-500', soft: 'bg-emerald-50 border-emerald-200' },
  OFFERED: { label: 'Offered', badge: 'primary', dot: 'bg-teal-500', soft: 'bg-teal-50 border-teal-200' },
  OFFER_ACCEPTED: { label: 'Offer Accepted', badge: 'success', dot: 'bg-green-600', soft: 'bg-green-50 border-green-200' },
  HIRED: { label: 'Hired', badge: 'success', dot: 'bg-green-700', soft: 'bg-green-50 border-green-200' },
  ON_HOLD: { label: 'On Hold', badge: 'neutral', dot: 'bg-slate-400', soft: 'bg-slate-50 border-slate-200' },
  REJECTED: { label: 'Rejected', badge: 'danger', dot: 'bg-red-500', soft: 'bg-red-50 border-red-200' },
  WITHDRAWN: { label: 'Withdrawn', badge: 'neutral', dot: 'bg-gray-400', soft: 'bg-gray-50 border-gray-200' },
};

export function stageMeta(stage: string): StageMeta {
  return STAGE_META[stage as ApplicationStage] ?? { label: stage, badge: 'gray', dot: 'bg-gray-400', soft: 'bg-gray-50 border-gray-200' };
}

/** Stages a pipeline is allowed to move to from `from` (terminal = final). */
export function movableStages(from: string): ApplicationStage[] {
  if (isTerminalStage(from)) return [];
  return APPLICATION_STAGES.filter((s) => s !== from);
}

export const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Internship' },
  { value: 'TEMPORARY', label: 'Temporary' },
];

export const JOB_SOURCES = ['DIRECT', 'WALK_IN', 'REFERRAL', 'QR_CODE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'PORTAL'];

export const FIELD_TYPES = [
  'TEXT', 'TEXTAREA', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'SELECT', 'RADIO', 'MULTISELECT',
  'CHECKBOX', 'YES_NO', 'FILE', 'PHOTO', 'AADHAAR', 'PAN', 'URL', 'CURRENCY',
] as const;

export type HiringFieldType = (typeof FIELD_TYPES)[number];

export const OPTION_FIELD_TYPES: HiringFieldType[] = ['SELECT', 'RADIO', 'MULTISELECT'];
export const FILE_FIELD_TYPES: HiringFieldType[] = ['FILE', 'PHOTO'];

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export interface HiringLocation {
  id: string;
  code: string;
  name: string;
}

export interface HiringFolder {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  formCount?: number;
}

export interface HiringTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  isSystem?: boolean | number;
  schema?: HiringFormSchema | null;
}

export interface HiringSelectOption {
  value: string;
  label: string;
}

export interface HiringFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minSelections?: number;
  maxSelections?: number;
  pattern?: string;
  patternMessage?: string;
  minAge?: number;
  maxAge?: number;
  minDate?: string;
  maxDate?: string;
  accept?: string[];
  maxSizeMB?: number;
}

export interface HiringFormField {
  key: string;
  type: HiringFieldType;
  label: string;
  required?: boolean;
  width?: 'full' | 'half' | 'third';
  placeholder?: string;
  helpText?: string;
  options?: HiringSelectOption[];
  validation?: HiringFieldValidation;
  conditional?: { fieldKey: string; operator: string; value?: unknown };
  defaultValue?: unknown;
}

export interface HiringFormStep {
  key: string;
  title: string;
  description?: string;
  fields: HiringFormField[];
}

export interface HiringFormSchema {
  version?: number;
  steps: HiringFormStep[];
}

export interface HiringVersion {
  id: string;
  formId: string;
  version: number;
  isDraft: number | boolean;
  changelog: string | null;
  publishedAt: string | null;
  publishedById: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HiringLink {
  id: string;
  formId: string;
  code: string;
  label: string | null;
  locationId: string | null;
  enabled: number | boolean;
  allowApplications: number | boolean;
  expiresAt: string | null;
  maxApplications: number | null;
  viewCount: number;
  startCount: number;
  submissions: number;
  lastActivityAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HiringForm {
  id: string;
  publicToken: string;
  title: string;
  jobTitle: string | null;
  jobDescription: string | null;
  employmentType: string;
  experienceLevel: string | null;
  qualification: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  openings: number;
  locationIds: string[];
  allowOtherLocations: boolean | number;
  shiftDetails: string | null;
  openAt: string | null;
  closeAt: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
  folderId: string | null;
  currentVersionId: string | null;
  templateKey: string | null;
  ownerId: string | null;
  settings: Record<string, unknown> | null;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  folderName: string | null;
  versionCount?: number;
  linkCount?: number;
  submissions?: number;
  views?: number;
}

export interface HiringFormDetail extends HiringForm {
  versions: HiringVersion[];
  links: HiringLink[];
  draft: { id: string; version: number; schema: HiringFormSchema } | null;
  published: { id: string; version: number; schema: HiringFormSchema } | null;
}

export interface LinkAnalytics {
  totals: { views: number; starts: number; submissions: number; conversionRate: number };
  byDay: Array<{ day: string; views: number; starts: number; submissions: number }>;
  byLink: Array<{ linkId: string; label: string | null; code: string; views: number; starts: number; submissions: number }>;
  byLocation: Array<{ locationId: string | null; locationCode: string | null; views: number; starts: number; submissions: number }>;
}

export interface ApplicationSummaryFields {
  fullName?: string;
  phone?: string;
  email?: string;
  city?: string;
  positionApplied?: string;
  experienceYears?: number;
  retailExperienceYears?: number;
  expectedSalary?: number;
  [key: string]: unknown;
}

export interface HiringApplication {
  id: string;
  candidateId: string;
  formId: string;
  formVersion: number;
  linkId: string | null;
  locationId: string;
  locationCode: string | null;
  shard: string | null;
  jobTitle: string | null;
  stage: ApplicationStage;
  previousStage: ApplicationStage | null;
  stageChangedAt: string | null;
  rejectionReason: string | null;
  rating: number | null;
  starred: boolean;
  expectedSalary: number | null;
  source: string | null;
  summary: ApplicationSummaryFields;
  appliedAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    photoKey: string | null;
    resumeKey: string | null;
    hasAadhaar: boolean;
    hasPan: boolean;
  } | null;
  noteCount: number;
  interviewCount: number;
}

export interface ShardSummary {
  databaseId: string;
  locationCode: string | null;
  success: boolean;
  rowCount: number;
  latencyMs: number;
  total?: number;
}

export interface HiringApplicationList {
  applications: HiringApplication[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  shardSummaries: ShardSummary[];
}

export interface ApplicationAnswer {
  fieldKey: string;
  fieldLabel: string | null;
  fieldType: string | null;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueBool: boolean | null;
  valueJson: unknown;
  fileKey: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
}

export interface ApplicationNote {
  id: string;
  applicationId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  isInternal: number | boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationTimelineEntry {
  id: string;
  applicationId: string;
  type: string;
  fromStage: string | null;
  toStage: string | null;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface HiringInterview {
  id: string;
  applicationId: string;
  candidateId?: string;
  candidateName?: string | null;
  jobTitle?: string | null;
  locationId?: string | null;
  locationCode?: string | null;
  round: string | number | null;
  mode: string | null;
  scheduledAt: string;
  durationMinutes: number | null;
  interviewerName: string | null;
  meetingLink: string | null;
  status: string | null;
  outcome: string | null;
  feedback: string | null;
  rating: number | null;
}

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  fieldKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  storageKey: string;
  createdAt: string;
}

export interface CandidateProfile {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  source: string | null;
  tags?: string[];
  applicationCount: number;
  firstSeenAt: string | null;
  lastAppliedAt: string | null;
  photoKey: string | null;
  resumeKey: string | null;
  resumeName: string | null;
  aadhaarMasked: string | null;
  panMasked: string | null;
  hasAadhaar: boolean;
  hasPan: boolean;
}

export interface ApplicationDetail {
  application: HiringApplication;
  candidate: CandidateProfile;
  answers: ApplicationAnswer[];
  notes: ApplicationNote[];
  timeline: ApplicationTimelineEntry[];
  interviews: HiringInterview[];
  documents: ApplicationDocument[];
  shard: { databaseId: string; locationCode: string | null } | null;
}

export interface HiringDashboardData {
  scope: { mode: string; locationIds?: string[] };
  totals: {
    applications: number;
    newThisWeek: number;
    inPipeline: number;
    hired: number;
    rejected: number;
    starred: number;
    averageRating: number | null;
    averageTimeToHireDays: number | null;
  };
  stageCounts: Array<{ stage: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byLocation: Array<{ locationId: string; locationCode: string | null; count: number; hired: number }>;
  funnel: { views: number; starts: number; submissions: number; conversionRate: number };
  forms: { published: number; totalOpenings: number };
  upcomingInterviews: HiringInterview[];
  shardSummaries: ShardSummary[];
}

export interface HiringSettingsBundle {
  'hiring.general': {
    consentText: string;
    retentionDays: number;
    requireCaptcha: boolean;
    maxSubmissionsPerPhonePerDay: number;
    autoRejectDuplicateWindowDays: number;
  };
  'hiring.branding': {
    companyName: string;
    primaryColor: string;
    supportEmail: string;
    supportPhone: string;
    privacyPolicyUrl: string;
  };
  'hiring.notifications': {
    notifyOnNewApplication: boolean;
    notifyOnStageChange: boolean;
    notifyLocationTeam: boolean;
  };
}

export interface HiringShardRow {
  databaseId: string;
  databaseName: string;
  shardName: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  locationStatus: string | null;
  hiringEnabled: boolean;
  isControlShard: boolean;
  status: string;
  healthStatus: string;
  latencyMs: number | null;
  lastHealthCheckAt: string | null;
  hiringSchemaReady: boolean;
  missingTables: string[];
}

export interface HiringOutboxStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  oldestPendingAt: string | null;
}

export interface PublicResolution {
  ok: true;
  form: {
    id: string;
    publicToken: string;
    title: string;
    jobTitle: string | null;
    jobDescription: string | null;
    employmentType: string | null;
    experienceLevel: string | null;
    qualification: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string;
    openings: number;
    shiftDetails: string | null;
    allowOtherLocations: boolean;
    openAt: string | null;
    closeAt: string | null;
  };
  schema: HiringFormSchema;
  version: { id: string; version: number };
  locations: HiringLocation[];
  settings: {
    consentText: string;
    requireCaptcha: boolean;
    companyName: string;
    primaryColor: string;
    privacyPolicyUrl: string;
  };
  link?: { id: string; code: string; label: string | null; locationId: string | null };
}

export interface PublicSubmitResult {
  applicationId: string;
  candidateId: string;
  referenceNumber: string;
  stage: ApplicationStage;
  locationId?: string;
  duplicate?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Public application URL a candidate opens for a share code. */
export function publicApplyUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return `${origin}/apply/${code}`;
}

export function stageLabel(stage: string): string {
  return stageMeta(stage).label;
}

export function formatSalaryRange(form: Pick<HiringForm, 'salaryMin' | 'salaryMax' | 'currency'>): string {
  if (!form.salaryMin && !form.salaryMax) return '—';
  const symbol = form.currency === 'INR' ? '₹' : `${form.currency} `;
  const fmt = (n: number) => n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  if (form.salaryMin && form.salaryMax) return `${symbol}${fmt(form.salaryMin)}–${symbol}${fmt(form.salaryMax)}`;
  return `${symbol}${fmt((form.salaryMin ?? form.salaryMax) as number)}`;
}

export function answerValue(answer: ApplicationAnswer): string {
  if (answer.fileName) return answer.fileName;
  if (answer.valueBool !== null && answer.valueBool !== undefined) return answer.valueBool ? 'Yes' : 'No';
  if (answer.valueNumber !== null && answer.valueNumber !== undefined) return String(answer.valueNumber);
  if (answer.valueDate) return String(answer.valueDate).slice(0, 10);
  if (answer.valueJson !== null && answer.valueJson !== undefined) {
    if (Array.isArray(answer.valueJson)) return answer.valueJson.map(String).join(', ');
    return typeof answer.valueJson === 'object' ? JSON.stringify(answer.valueJson) : String(answer.valueJson);
  }
  return answer.valueText ?? '—';
}

/** Slugify a label into a field key candidate (builder helper). */
export function toFieldKey(label: string): string {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return /^[a-z]/.test(cleaned) ? cleaned : `field_${cleaned}`;
}

export function isFormOpen(form: Pick<HiringForm, 'openAt' | 'closeAt' | 'status'>): boolean {
  if (form.status !== 'PUBLISHED') return false;
  const now = Date.now();
  if (form.openAt && new Date(form.openAt).getTime() > now) return false;
  if (form.closeAt && new Date(form.closeAt).getTime() < now) return false;
  return true;
}
