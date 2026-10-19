/**
 * Standardized dropdown options and constants for the Employee Details creation form.
 * Scoped strictly to the Employee Details Add New Employee modal.
 */

export const EMPLOYEE_FORM_DEPARTMENTS = [
  'ACCOUNTS',
  'BILLING',
  'BLOUSE & DRESS MTRL',
  'BRAND (BSC) STAFF',
  'BRAND ARROW (BRAND STAFF)',
  'BRAND BB (BSC STAFF)',
  'BRAND IT (BRAND STAFF)',
  'BRAND LENIN CLUB (BRAND STAFF)',
  'BRAND LEVIS (BRAND STAFF)',
  'BRAND LP (BRAND STAFF)',
  'BRAND MFT (BSC STAFF)',
  'BRAND OK (BSC BRAND STAFF)',
  'BRAND PARX (BRAND STAFF)',
  'BRAND PE (BSC STAFF)',
  'BRAND PEPE (BSC STAFF)',
  'BRAND PUMA (BRAND STAFF)',
  'BRAND QCB (BRAND STAFF)',
  'BRAND ROKIES (BRAND STAFF)',
  'BRAND SPYKAR (BSC STAFF)',
  'BRAND TRIMUS (BRAND STAFF)',
  'BRAND US POLO (BSC STAFF)',
  'BRAND VH (BRAND STAFF)',
  'BRAND VH (BSC STAFF)',
  'CHUDI SET',
  'CUSTOMER SERVICE DESK',
  'DHOTHI',
  'DRESS MATERIAL',
  'DRIVER',
  'HOME FURNISHING',
  'HOUSEKEEPING',
  'HUMAN RESOURCE',
  'IT',
  'KIDS',
  'LADIES READYMADE',
  'LOGISTIC',
  'MAINTAINANCE',
  'MARKETING',
  'MENS INNER GARMENTS',
  'MENS READYMADE',
  'MENS READYMADE ECONOMY',
  'MENS READYMADE ETHNIC',
  'MENS READYMADE MID SECTION',
  'MENS TAILOR',
  'PACKING',
  'SAREE',
  'SECURITY',
  'STORE',
  'SUITING & SHIRTING',
  'VISUAL MERCHANDISING',
] as const;

export const EMPLOYEE_FORM_DESIGNATIONS = [
  'ACCOUNTS',
  'BILLER',
  'BRAND SALESMAN',
  'CASHIER',
  'ELECTRICIAN (MAINT)',
  'EXECUTIVE',
  'FLOOR MANAGER',
  'GREETER',
  'HELPER',
  'HOUSE KEEPING',
  'HR',
  'MANAGER',
  'PACKER',
  'SALEMAN UNDER GARMENTS',
  'SALESMAN',
  'SALESMAN ECONOMY',
  'SALESMAN ETHNICS',
  'SALESMAN MID SECTION',
  'SECTION SUPERVISOR',
  'SECURITY',
  'SENIOR EXECUTIVE',
  'TAILOR',
  'VISUAL MERCHANDISING EXECUTIVE',
] as const;

export const INITIAL_LOCATIONS = [
  { label: 'Davanagere (BSC-DVG)', code: 'BSC-DVG', name: 'Davanagere', hubCode: 'DAV' },
  { label: 'Belagavi (BSC-BEL)', code: 'BSC-BEL', name: 'Belagavi', hubCode: 'BEL' },
  { label: 'Shivamogga (BSC-SMG)', code: 'BSC-SMG', name: 'Shivamogga', hubCode: 'SHI' },
] as const;

export const INITIAL_DIVISIONS = [
  'Basement Division',
  'Sarees Division',
  'Ladies Division',
  "Men's Division",
  'Kids Division',
] as const;

export const INITIAL_FLOORS = [
  'Basement',
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
] as const;

export const MARITAL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Divorced',
  'Widowed',
  'Prefer not to say',
] as const;

export const CATEGORY_OPTIONS = [
  'General',
  'OBC',
  'SC',
  'ST',
  'EWS',
  'Other',
] as const;

export const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
] as const;
