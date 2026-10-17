import assert from 'node:assert';
import { TestResult } from './attendance.test.js';
import {
  isValidPhone,
  normalizePhone,
  formatPhone,
  isValidEmail,
  normalizeEmail,
  isValidPincode,
  isValidPan,
  normalizePan,
  isValidAadhaar,
  normalizeAadhaar,
  maskAadhaar,
  maskPan,
  isValidName,
  normalizeName,
  parseIsoDate,
  ageAt,
  isValidDob,
  validateFileMeta,
  sniffExtensionFromBuffer,
  evaluateCondition,
  visibleFields,
  validateHiringSubmission,
  summarizeSubmission,
  canTransitionStage,
  isApplicationStage,
  type HiringFormSchema,
} from '../validation/hiringValidators.js';

const validSchema: HiringFormSchema = {
  steps: [
    {
      key: 'personal',
      title: 'Personal',
      fields: [
        { key: 'fullName', type: 'TEXT', label: 'Full Name', required: true, validation: { minLength: 2, maxLength: 120, pattern: 'name' } },
        { key: 'phone', type: 'PHONE', label: 'Mobile Number', required: true },
        { key: 'email', type: 'EMAIL', label: 'Email', required: false },
        { key: 'gender', type: 'SELECT', label: 'Gender', required: false, options: [{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }] },
        {
          key: 'militaryService',
          type: 'TEXT',
          label: 'Military Service Details',
          required: true,
          conditional: { fieldKey: 'gender', operator: 'equals', value: 'MALE' },
        },
        { key: 'dob', type: 'DATE', label: 'Date of Birth', required: false, validation: { minAge: 18 } },
        { key: 'aadhaar', type: 'AADHAAR', label: 'Aadhaar', required: false },
        { key: 'skills', type: 'MULTISELECT', label: 'Skills', required: false, validation: { minSelections: 1, maxSelections: 2 }, options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }] },
        { key: 'resume', type: 'FILE', label: 'Resume', required: true, validation: { accept: ['pdf', 'docx'], maxSizeMB: 2 } },
        { key: 'consent', type: 'CHECKBOX', label: 'Consent', required: true },
      ],
    },
  ],
};

export async function runHiringValidatorTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const test = (name: string, fn: () => void) => {
    const start = Date.now();
    try {
      fn();
      results.push({ suite: 'Hiring Validators', name, passed: true, durationMs: Date.now() - start });
    } catch (err: any) {
      results.push({ suite: 'Hiring Validators', name, passed: false, durationMs: Date.now() - start, error: err.message });
    }
  };

  test('Phone: accepts 10 digits, +91, 0-prefixed, spaced formats', () => {
    assert.ok(isValidPhone('9876543210'));
    assert.ok(isValidPhone('+91 98765 43210'));
    assert.ok(isValidPhone('+919876543210'));
    assert.ok(isValidPhone('09876543210'));
    assert.ok(isValidPhone('98765-43210'));
    assert.strictEqual(normalizePhone('+91 98765 43210'), '9876543210');
    assert.strictEqual(formatPhone('09876543210'), '+91 98765 43210');
  });

  test('Phone: rejects short, letters and leading 5', () => {
    assert.ok(!isValidPhone('12345'));
    assert.ok(!isValidPhone('5876543210'));
    assert.ok(!isValidPhone('98765432101'));
    assert.ok(!isValidPhone('abc9876543210'));
    assert.strictEqual(normalizePhone('not-a-phone'), null);
  });

  test('Email: normalizes case and rejects malformed values', () => {
    assert.ok(isValidEmail('Candidate@Example.COM'));
    assert.strictEqual(normalizeEmail('  Candidate@Example.COM '), 'candidate@example.com');
    assert.ok(!isValidEmail('missing@tld'));
    assert.ok(!isValidEmail('no spaces@example.com'));
    assert.ok(!isValidEmail('a@b.c'));
  });

  test('Pincode: 6 digits, cannot start with 0', () => {
    assert.ok(isValidPincode('590006'));
    assert.ok(isValidPincode('577201'));
    assert.ok(!isValidPincode('090006'));
    assert.ok(!isValidPincode('59006'));
    assert.ok(!isValidPincode('59000a'));
  });

  test('PAN: format + official holder-type letter enforced', () => {
    assert.ok(isValidPan('ABCPD1234F'));
    assert.ok(isValidPan('abcpe1234f'));
    assert.strictEqual(normalizePan('abcpe1234f'), 'ABCPE1234F');
    assert.ok(!isValidPan('ABCDE1234F'));
    assert.ok(!isValidPan('ABCPD12345'));
    assert.ok(!isValidPan('AB1PD1234F'));
  });

  test('Aadhaar: Verhoeff checksum rejects fabricated numbers', () => {
    assert.ok(isValidAadhaar('999941057058'));
    assert.ok(isValidAadhaar('9999 4105 7058'));
    assert.strictEqual(normalizeAadhaar('9999-4105-7058'), '999941057058');
    assert.ok(!isValidAadhaar('123456789012'));
    assert.ok(!isValidAadhaar('999941057057'));
    assert.ok(!isValidAadhaar('12345678901'));
    assert.ok(!isValidAadhaar('111111111111'));
    assert.strictEqual(maskAadhaar('999941057058'), 'XXXX XXXX 7058');
    assert.strictEqual(maskPan('ABCPD1234F'), 'AXXXX1234F');
  });

  test('Name: unicode letters allowed, digits rejected, whitespace collapsed', () => {
    assert.ok(isValidName('Ramesh Kumar'));
    assert.ok(isValidName('A. B. Shetty'));
    assert.ok(isValidName('Shivakumar'));
    assert.ok(isValidName('ದೇವರಾಜ್')); // Kannada
    assert.ok(!isValidName('Ramesh 123'));
    assert.ok(!isValidName('X'));
    assert.ok(!isValidName('---'));
    assert.strictEqual(normalizeName('  Ramesh   Kumar '), 'Ramesh Kumar');
  });

  test('Dates and age: real calendar dates only, minAge enforced', () => {
    assert.ok(parseIsoDate('1995-06-15'));
    assert.strictEqual(parseIsoDate('1995-02-30'), null);
    assert.strictEqual(parseIsoDate('15-06-1995'), null);
    const ref = new Date(Date.UTC(2026, 0, 1));
    assert.strictEqual(ageAt(new Date(Date.UTC(2000, 0, 1)), ref), 26);
    assert.strictEqual(ageAt(new Date(Date.UTC(2008, 5, 1)), ref), 17);
    assert.ok(isValidDob('2000-01-01', { minAge: 18 }));
    assert.ok(!isValidDob('2015-01-01', { minAge: 18 }));
  });

  test('Files: extension allow-list, size cap, mime match', () => {
    assert.strictEqual(validateFileMeta({ name: 'cv.pdf', mime: 'application/pdf', sizeBytes: 100_000 }, { accept: ['pdf'], maxSizeMB: 2 }), null);
    assert.ok(validateFileMeta({ name: 'virus.exe', sizeBytes: 10 }, { accept: ['pdf'] }));
    assert.ok(validateFileMeta({ name: 'big.pdf', sizeBytes: 3 * 1024 * 1024 }, { accept: ['pdf'], maxSizeMB: 2 }));
    assert.ok(validateFileMeta({ name: 'cv.pdf', mime: 'text/plain', sizeBytes: 10 }, { accept: ['pdf'], maxSizeMB: 2 }));
    assert.ok(validateFileMeta({ name: 'cv.pdf', sizeBytes: 0 }, { accept: ['pdf'], maxSizeMB: 2 }));
  });

  test('Magic bytes: pdf/jpg/png/webp/doc detected, renamed executables not', () => {
    assert.strictEqual(sniffExtensionFromBuffer(Buffer.from('%PDF-1.7 test')), 'pdf');
    assert.strictEqual(sniffExtensionFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])), 'jpg');
    assert.strictEqual(sniffExtensionFromBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
    assert.strictEqual(sniffExtensionFromBuffer(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])), null);
  });

  test('Conditional logic: equals/in/contains/gt/is_answered', () => {
    assert.ok(evaluateCondition({ fieldKey: 'a', operator: 'equals', value: 'X' }, { a: 'x' }));
    assert.ok(evaluateCondition({ fieldKey: 'a', operator: 'in', value: ['X', 'Y'] }, { a: 'Y' }));
    assert.ok(evaluateCondition({ fieldKey: 'a', operator: 'contains', value: 'ilk' }, { a: 'Milkshake' }));
    assert.ok(evaluateCondition({ fieldKey: 'n', operator: 'gt', value: 5 }, { n: 7 }));
    assert.ok(evaluateCondition({ fieldKey: 'x', operator: 'is_answered' }, { x: ['v'] }));
    assert.ok(!evaluateCondition({ fieldKey: 'x', operator: 'is_answered' }, { x: '' }));
    assert.ok(evaluateCondition(undefined, {})); // no condition = always visible
  });

  test('Submission: required, hidden-field dropping and sanitization', () => {
    const base = {
      fullName: 'Ramesh Kumar',
      phone: '+91 98765 43210',
      gender: 'FEMALE',
      consent: true,
    };
    const files = { resume: { name: 'cv.pdf', mime: 'application/pdf', sizeBytes: 1000 } };

    const hiddenMale = validateHiringSubmission(validSchema, base, files);
    assert.ok(hiddenMale.valid, JSON.stringify(hiddenMale.errors));
    assert.ok(!('militaryService' in hiddenMale.values), 'hidden field must be dropped');
    assert.strictEqual(hiddenMale.values.phone, '9876543210');

    const smuggled = validateHiringSubmission(validSchema, { ...base, militaryService: 'smuggled' }, files);
    assert.ok(!('militaryService' in smuggled.values), 'answers for hidden fields must not be stored');

    const missingConditional = validateHiringSubmission(validSchema, { ...base, gender: 'MALE' }, files);
    assert.ok(!missingConditional.valid);
    assert.ok(missingConditional.errors.militaryService);
  });

  test('Submission: field-rule enforcement and type coercion', () => {
    const files = { resume: { name: 'cv.pdf', mime: 'application/pdf', sizeBytes: 1000 } };

    const badName = validateHiringSubmission(validSchema, { fullName: 'R1', phone: '9876543210', consent: true, gender: 'FEMALE' }, files);
    assert.ok(!badName.valid && badName.errors.fullName);

    const badPhone = validateHiringSubmission(validSchema, { fullName: 'Ramesh', phone: '12345', consent: true, gender: 'FEMALE' }, files);
    assert.ok(!badPhone.valid && badPhone.errors.phone);

    const untickedConsent = validateHiringSubmission(validSchema, { fullName: 'Ramesh', phone: '9876543210', consent: false, gender: 'FEMALE' }, files);
    assert.ok(!untickedConsent.valid && untickedConsent.errors.consent);

    const noResume = validateHiringSubmission(validSchema, { fullName: 'Ramesh', phone: '9876543210', consent: true, gender: 'FEMALE' }, {});
    assert.ok(!noResume.valid && noResume.errors.resume);

    const badAadhaar = validateHiringSubmission(
      validSchema,
      { fullName: 'Ramesh', phone: '9876543210', consent: true, gender: 'FEMALE', aadhaar: '123456789012' },
      files
    );
    assert.ok(!badAadhaar.valid && badAadhaar.errors.aadhaar);

    const tooManySkills = validateHiringSubmission(
      validSchema,
      { fullName: 'Ramesh', phone: '9876543210', consent: true, gender: 'FEMALE', skills: ['A', 'B', 'C'] },
      files
    );
    assert.ok(!tooManySkills.valid && tooManySkills.errors.skills);

    const underage = validateHiringSubmission(
      validSchema,
      { fullName: 'Ramesh', phone: '9876543210', consent: true, gender: 'FEMALE', dob: '2015-01-01' },
      files
    );
    assert.ok(!underage.valid && underage.errors.dob);
  });

  test('Submission: unknown fields are discarded entirely', () => {
    const result = validateHiringSubmission(
      validSchema,
      { fullName: 'Ramesh', phone: '9876543210', consent: true, gender: 'FEMALE', isAdmin: true, __proto__hack: 'x' },
      { resume: { name: 'cv.pdf', sizeBytes: 1000 } }
    );
    assert.ok(result.valid);
    assert.ok(!('isAdmin' in result.values));
    assert.ok(!('__proto__hack' in result.values));
  });

  test('Summary: builds list-view payload from answers', () => {
    const schema: HiringFormSchema = {
      steps: [{ key: 's1', title: 'S1', fields: [
        { key: 'fullName', type: 'TEXT', label: 'Full Name' },
        { key: 'phone', type: 'PHONE', label: 'Phone' },
        { key: 'experienceYears', type: 'NUMBER', label: 'Experience' },
      ] }],
    };
    const summary = summarizeSubmission(schema, { fullName: 'Ramesh Kumar', phone: '9876543210', experienceYears: 5 });
    assert.strictEqual(summary.fullName, 'Ramesh Kumar');
    assert.strictEqual(summary.phone, '9876543210');
    assert.strictEqual(summary.experienceYears, 5);
  });

  test('Stages: transition rules block terminal-stage moves', () => {
    assert.ok(isApplicationStage('NEW'));
    assert.ok(!isApplicationStage('UNKNOWN'));
    assert.ok(canTransitionStage('NEW', 'SHORTLISTED'));
    assert.ok(!canTransitionStage('HIRED', 'REJECTED'));
    assert.ok(!canTransitionStage('NEW', 'NEW'));
    assert.ok(canTransitionStage('NEW', 'REJECTED'));
  });

  test('Visible fields: chained conditions resolve', () => {
    const schema: HiringFormSchema = {
      steps: [{ key: 's', title: 'S', fields: [
        { key: 'hasVehicle', type: 'YES_NO', label: 'Has vehicle' },
        { key: 'vehicleType', type: 'TEXT', label: 'Vehicle type', conditional: { fieldKey: 'hasVehicle', operator: 'equals', value: true } },
        { key: 'licenseNumber', type: 'TEXT', label: 'License', conditional: { fieldKey: 'vehicleType', operator: 'in', value: ['bike', 'car'] } },
      ] }],
    };
    const none = visibleFields(schema, {});
    assert.deepStrictEqual(none.map((f) => f.key), ['hasVehicle']);
    const bike = visibleFields(schema, { hasVehicle: true, vehicleType: 'bike' });
    assert.deepStrictEqual(bike.map((f) => f.key), ['hasVehicle', 'vehicleType', 'licenseNumber']);
  });

  return results;
}
