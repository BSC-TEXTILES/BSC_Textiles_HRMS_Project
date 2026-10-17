/**
 * Candidate Hiring — global settings (control DB `hiring_settings`).
 *
 * Rows are keyed JSON documents; this module merges them over hard defaults so
 * callers always get a complete, typed object even before an admin saves
 * anything.
 */

import { shardManager } from '../../core/sharding/index.js';

export interface HiringGeneralSettings {
  consentText: string;
  retentionDays: number;
  requireCaptcha: boolean;
  maxSubmissionsPerPhonePerDay: number;
  autoRejectDuplicateWindowDays: number;
}

export interface HiringBrandingSettings {
  companyName: string;
  primaryColor: string;
  supportEmail: string;
  supportPhone: string;
  privacyPolicyUrl: string;
}

export interface HiringNotificationSettings {
  notifyOnNewApplication: boolean;
  notifyOnStageChange: boolean;
  notifyLocationTeam: boolean;
}

export const HIRING_SETTING_DEFAULTS = {
  'hiring.general': {
    consentText: 'I agree to the collection and processing of my personal information for recruitment purposes.',
    retentionDays: 365,
    requireCaptcha: true,
    maxSubmissionsPerPhonePerDay: 5,
    autoRejectDuplicateWindowDays: 30,
  } as HiringGeneralSettings,
  'hiring.branding': {
    companyName: 'BSC Textiles',
    primaryColor: '#0f766e',
    supportEmail: 'hr@bsctextiles.com',
    supportPhone: '',
    privacyPolicyUrl: '',
  } as HiringBrandingSettings,
  'hiring.notifications': {
    notifyOnNewApplication: true,
    notifyOnStageChange: false,
    notifyLocationTeam: true,
  } as HiringNotificationSettings,
};

export type HiringSettingKey = keyof typeof HIRING_SETTING_DEFAULTS;

function controlPool() {
  return shardManager.getControlPool();
}

async function readRaw(key: string): Promise<Record<string, unknown> | null> {
  try {
    const [rows]: any = await controlPool().query('SELECT `value` FROM hiring_settings WHERE `key` = ? LIMIT 1', [key]);
    if (rows.length === 0) return null;
    const value = rows[0].value;
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (err: any) {
    console.warn(`[hiringSettings] read failed for ${key}:`, err.message);
    return null;
  }
}

export async function getSettings<K extends HiringSettingKey>(key: K): Promise<(typeof HIRING_SETTING_DEFAULTS)[K]> {
  const defaults = HIRING_SETTING_DEFAULTS[key];
  const stored = await readRaw(key);
  return { ...defaults, ...(stored ?? {}) } as (typeof HIRING_SETTING_DEFAULTS)[K];
}

export async function getAllSettings(): Promise<{ [K in HiringSettingKey]: (typeof HIRING_SETTING_DEFAULTS)[K] }> {
  const keys = Object.keys(HIRING_SETTING_DEFAULTS) as HiringSettingKey[];
  const values = await Promise.all(keys.map((k) => getSettings(k)));
  const out = {} as any;
  keys.forEach((k, i) => {
    out[k] = values[i];
  });
  return out;
}

export async function updateSettings<K extends HiringSettingKey>(
  key: K,
  patch: Partial<(typeof HIRING_SETTING_DEFAULTS)[K]>,
  updatedById?: string | null
): Promise<(typeof HIRING_SETTING_DEFAULTS)[K]> {
  const current = await getSettings(key);
  const next = { ...current, ...patch };
  await controlPool().query(
    `INSERT INTO hiring_settings (\`key\`, \`value\`, updatedById) VALUES (?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updatedById = VALUES(updatedById), updatedAt = CURRENT_TIMESTAMP(3)`,
    [key, JSON.stringify(next), updatedById ?? null]
  );
  return next as (typeof HIRING_SETTING_DEFAULTS)[K];
}
