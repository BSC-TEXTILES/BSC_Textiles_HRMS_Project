/**
 * Executive Dashboard Shift Filter & Break Policy Configuration
 * Adheres to statutory labor compliance rules:
 * - Lunch cap: 45 minutes
 * - Tea cap: 20 minutes
 * - Grace buffer: 3 minutes
 */

export interface StatutoryCapsConfig {
  lunchCapMinutes: number;
  teaCapMinutes: number;
  graceBufferMinutes: number;
}

export const STATUTORY_CAPS: StatutoryCapsConfig = {
  lunchCapMinutes: 45,
  teaCapMinutes: 20,
  graceBufferMinutes: 3,
};

/**
 * Single constant for the Shift I Roman numeral label so it can be changed in one place.
 */
export const SHIFT_I_LABEL = 'Shift I';

/**
 * Allowed Tea Break choices in the Custom Shift dialog.
 * Only these four choices are offered. "No Tea Break" stores 0 minutes.
 */
export const TEA_BREAK_OPTIONS = [
  { label: 'No Tea Break', minutes: 0 },
  { label: '10 Min', minutes: 10 },
  { label: '15 Min', minutes: 15 },
  { label: '20 Min', minutes: 20 },
] as const;

export type TeaBreakMinutes = 0 | 10 | 15 | 20;

export const TEA_BREAK_SLOTS = ['None', 'Morning', 'Evening'] as const;
export type TeaBreakSlot = (typeof TEA_BREAK_SLOTS)[number];

/**
 * Allowed Lunch Break choices in the Custom Shift dialog.
 * Exactly three options: 1hr 40 Min (100 min), 1hr (60 min), and 45 Min (45 min).
 */
export const LUNCH_BREAK_OPTIONS = [
  { label: '1hr 40 Min', minutes: 100 },
  { label: '1hr', minutes: 60 },
  { label: '45 Min', minutes: 45 },
] as const;

export type LunchBreakMinutes = (typeof LUNCH_BREAK_OPTIONS)[number]['minutes'];
