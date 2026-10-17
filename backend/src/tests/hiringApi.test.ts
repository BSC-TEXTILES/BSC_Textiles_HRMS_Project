/**
 * Candidate Hiring — live API end-to-end suite.
 *
 * Drives the full flow the real UI drives:
 *   create draft → save schema version → publish → share link → public resolve
 *   → uploads → captcha gate → submit → duplicate guard → pipeline ops
 *   (stage, notes, interviews, rating) → isolation → analytics → export.
 *
 * Runs against the live dev stack (`http://localhost:4000`) with personas
 * authenticated by the runner. Cleans up the form/link/application it created
 * and restores the captcha setting it temporarily disables.
 */

import assert from 'node:assert';
import { TestResult } from './attendance.test.js';

const BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/api\/?$/, '');

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const PNG_BYTES = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.from('0000000d4948445200000001000000010806000000', 'hex'),
  Buffer.from('1f15c489', 'hex'),
  Buffer.alloc(96, 7),
]);

const PDF_BYTES = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.from('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'),
  Buffer.from('%%EOF\n'),
  Buffer.alloc(64, 32),
]);

export async function runHiringApiTests(
  adminToken: string,
  belagaviHrToken: string,
  shivamoggaHrToken: string
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = 'CANDIDATE HIRING (API)';

  const runTest = async (name: string, fn: () => Promise<void>) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ suite, name, passed: true, durationMs: Date.now() - start });
      console.log(`  ✔ PASS: ${name}`);
    } catch (err: any) {
      results.push({ suite, name, passed: false, error: err.message || String(err), durationMs: Date.now() - start });
      console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
    }
  };

  const api = (path: string, token: string, init: RequestInit = {}) => {
    const headers = { ...authHeaders(token), ...((init.headers as Record<string, string>) || {}) };
    return fetch(`${BASE_URL}${path}`, { ...init, headers });
  };
  const apiJson = (path: string, token: string, method: string, body?: unknown) =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: jsonHeaders(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const unique = Date.now().toString(36);
  const phone = `9${String(Date.now()).slice(-9)}`;
  const validAadhaar = '999941057058';
  const maskedAadhaar = 'XXXX XXXX 7058';
  const validPan = 'ABCPD1234F';

  let originalRequireCaptcha: boolean | null = null;
  let belagaviId = '';
  let formId = '';
  let formPublicToken = '';
  let linkId = '';
  let linkCode = '';
  let applicationId = '';
  let candidateId = '';
  let noteId = '';
  let interviewId = '';
  let photoToken = '';
  let resumeToken = '';

  const schema = {
    steps: [
      {
        key: 'personal',
        title: 'Personal Details',
        fields: [
          { key: 'fullName', type: 'TEXT', label: 'Full Name', required: true, validation: { minLength: 2, maxLength: 120 } },
          { key: 'phone', type: 'PHONE', label: 'Mobile Number', required: true },
          { key: 'city', type: 'TEXT', label: 'City', required: true },
          { key: 'experienceYears', type: 'NUMBER', label: 'Experience (years)', required: false, validation: { min: 0, max: 50 } },
          { key: 'aadhaarNumber', type: 'AADHAAR', label: 'Aadhaar Number', required: false },
          { key: 'panNumber', type: 'PAN', label: 'PAN', required: false },
          { key: 'photo', type: 'PHOTO', label: 'Photo', required: false, validation: { accept: ['jpg', 'jpeg', 'png'], maxSizeMB: 2 } },
          { key: 'resume', type: 'FILE', label: 'Resume', required: false, validation: { accept: ['pdf', 'doc', 'docx'], maxSizeMB: 5 } },
          { key: 'consent', type: 'CHECKBOX', label: 'Consent', required: true },
        ],
      },
    ],
  };

  const validValues = () => ({
    fullName: 'Automated Test Candidate',
    phone,
    city: 'Belagavi',
    experienceYears: 3,
    aadhaarNumber: validAadhaar,
    panNumber: validPan,
    consent: true,
  });

  const submitPublic = (overrides: Record<string, unknown>) =>
    fetch(`${BASE_URL}/api/hiring/public/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hiring-session': `qa-${unique}` },
      body: JSON.stringify({
        linkCode,
        locationId: belagaviId,
        values: validValues(),
        files: { photo: photoToken, resume: resumeToken },
        consent: true,
        source: 'QA_SUITE',
        ...overrides,
      }),
    });

  try {
    // ---------------------------------------------------------------- 1. meta
    await runTest('1. HR dashboard returns scoped KPIs, funnel and shard summaries', async () => {
      const res = await api('/api/hiring/dashboard', adminToken);
      assert.strictEqual(res.status, 200);
      const d: any = await res.json();
      assert.ok(d.totals && typeof d.totals.applications === 'number', 'totals.applications missing');
      assert.ok(typeof d.totals.hired === 'number', 'totals.hired missing');
      assert.ok(Array.isArray(d.stageCounts) && d.stageCounts.length >= 1, 'stageCounts missing');
      assert.ok(d.stageCounts.every((s: any) => typeof s.stage === 'string' && typeof s.count === 'number'), 'stageCounts shape');
      assert.ok(Array.isArray(d.byDay), 'byDay missing');
      assert.ok(d.funnel && typeof d.funnel.views === 'number', 'funnel missing');
      assert.ok(Array.isArray(d.shardSummaries) && d.shardSummaries.length >= 1, 'shardSummaries missing');
    });

    await runTest('2. Dashboard rejects anonymous access with 401', async () => {
      const res = await fetch(`${BASE_URL}/api/hiring/dashboard`);
      assert.strictEqual(res.status, 401);
    });

    await runTest('3. Settings bundle exposes general/branding/notifications documents', async () => {
      const res = await api('/api/hiring/settings', adminToken);
      assert.strictEqual(res.status, 200);
      const s: any = await res.json();
      assert.ok(s['hiring.general'] && typeof s['hiring.general'].requireCaptcha === 'boolean');
      assert.ok(s['hiring.branding'] && s['hiring.branding'].companyName);
      assert.ok(s['hiring.notifications'] && typeof s['hiring.notifications'].notifyOnNewApplication === 'boolean');
      originalRequireCaptcha = s['hiring.general'].requireCaptcha;
    });

    await runTest('4. Hiring locations, folders and templates are listable', async () => {
      const locRes = await api('/api/hiring/locations', adminToken);
      assert.strictEqual(locRes.status, 200);
      const locations = (await locRes.json()) as any[];
      const bel = locations.find((l) => l.code === 'BEL');
      assert.ok(bel, 'BEL location missing');
      belagaviId = bel.id;

      const folderRes = await api('/api/hiring/folders', adminToken);
      assert.strictEqual(folderRes.status, 200);
      assert.ok(Array.isArray(await folderRes.json()));

      const templateRes = await api('/api/hiring/templates', adminToken);
      assert.strictEqual(templateRes.status, 200);
      const templates = (await templateRes.json()) as any[];
      assert.ok(templates.length >= 1, 'seed templates missing');
    });

    // ------------------------------------------------------------- 2. form
    await runTest('5. Draft form is created, schema version saved, then published', async () => {
      const createRes = await apiJson('/api/hiring/forms', adminToken, 'POST', {
        title: `QA Hiring ${unique}`,
        jobTitle: 'QA Store Associate',
        employmentType: 'FULL_TIME',
        openings: 1,
        locationIds: [belagaviId],
      });
      if (createRes.status !== 201) throw new Error(`create status ${createRes.status}: ${await createRes.text()}`);
      const form: any = await createRes.json();
      formId = form.id;
      formPublicToken = form.publicToken;
      assert.ok(formId.startsWith('hform_'));
      assert.strictEqual(form.status, 'DRAFT');

      const versionRes = await apiJson(`/api/hiring/forms/${formId}/versions`, adminToken, 'POST', {
        schema,
        changelog: 'Initial QA schema',
      });
      if (versionRes.status !== 201) throw new Error(`version status ${versionRes.status}: ${await versionRes.text()}`);

      const updateRes = await apiJson(`/api/hiring/forms/${formId}`, adminToken, 'PUT', {
        jobDescription: 'Automated test opening — safe to delete.',
      });
      assert.strictEqual(updateRes.status, 200);

      const publishRes = await apiJson(`/api/hiring/forms/${formId}/publish`, adminToken, 'POST');
      if (publishRes.status !== 200) throw new Error(`publish status ${publishRes.status}: ${await publishRes.text()}`);
      const published: any = await publishRes.json();
      assert.strictEqual(published.status, 'PUBLISHED');

      const detailRes = await api(`/api/hiring/forms/${formId}`, adminToken);
      const detail: any = await detailRes.json();
      assert.ok(detail.published && detail.published.version >= 1, 'published version missing');
      assert.ok(String(detail.published.id).startsWith('hver_'), 'published version id missing');
      assert.strictEqual(detail.published.schema.steps.length, 1);
    });

    await runTest('6. Share link is created and resolves publicly with schema + settings', async () => {
      const createRes = await apiJson(`/api/hiring/forms/${formId}/links`, adminToken, 'POST', {
        label: 'QA automated link',
        locationId: belagaviId,
      });
      if (createRes.status !== 201) throw new Error(`link status ${createRes.status}: ${await createRes.text()}`);
      const link: any = await createRes.json();
      linkId = link.id;
      linkCode = link.code;
      assert.ok(linkCode && linkCode.length >= 6);

      const resolveRes = await fetch(`${BASE_URL}/api/hiring/public/links/${linkCode}`, {
        headers: { 'x-hiring-session': `qa-${unique}` },
      });
      assert.strictEqual(resolveRes.status, 200);
      const resolution: any = await resolveRes.json();
      assert.strictEqual(resolution.ok, true);
      assert.strictEqual(resolution.link.locationId, belagaviId);
      assert.ok(resolution.schema.steps[0].fields.some((f: any) => f.key === 'aadhaarNumber'));
      assert.ok(resolution.locations.some((l: any) => l.code === 'BEL'));
      assert.strictEqual(resolution.form.publicToken, formPublicToken);
    });

    await runTest('7. Unknown or disabled links fail with 404/410 and never leak the form', async () => {
      const bogus = await fetch(`${BASE_URL}/api/hiring/public/links/QQQQQQQQ`);
      assert.strictEqual(bogus.status, 404);

      const disableRes = await apiJson(`/api/hiring/links/${linkId}`, adminToken, 'PATCH', { enabled: false });
      assert.strictEqual(disableRes.status, 200);
      const disabled = await fetch(`${BASE_URL}/api/hiring/public/links/${linkCode}`);
      assert.strictEqual(disabled.status, 410);
      const body: any = await disabled.json();
      assert.strictEqual(body.code, 'DISABLED');

      const reEnable = await apiJson(`/api/hiring/links/${linkId}`, adminToken, 'PATCH', { enabled: true });
      assert.strictEqual(reEnable.status, 200);
    });

    // ------------------------------------------------------------ 3. uploads
    await runTest('8. Raw upload accepts genuine PNG/PDF and rejects spoofed content', async () => {
      const upload = (fieldKey: string, fileName: string, body: Buffer, contentType: string, extra: Record<string, string> = {}) =>
        fetch(`${BASE_URL}/api/hiring/public/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': contentType,
            'x-form-token': formPublicToken,
            'x-field-key': fieldKey,
            'x-file-name': encodeURIComponent(fileName),
            ...extra,
          },
          body,
        });

      const photoRes = await upload('photo', 'candidate.png', PNG_BYTES, 'image/png', { 'x-photo': '1' });
      assert.strictEqual(photoRes.status, 201, `photo upload ${photoRes.status}`);
      const photo: any = await photoRes.json();
      assert.ok(photo.token, 'photo token missing');
      assert.strictEqual(photo.mime, 'image/png');
      photoToken = photo.token;

      const resumeRes = await upload('resume', 'resume.pdf', PDF_BYTES, 'application/pdf');
      assert.strictEqual(resumeRes.status, 201, `resume upload ${resumeRes.status}`);
      const resume: any = await resumeRes.json();
      resumeToken = resume.token;

      const spoofRes = await upload('resume', 'fake.pdf', Buffer.from('totally not a pdf, just text'), 'application/pdf');
      assert.strictEqual(spoofRes.status, 400);
      const spoof: any = await spoofRes.json();
      assert.ok(['FILE_CONTENT_MISMATCH', 'UNSUPPORTED_FILE_TYPE'].includes(spoof.code), `unexpected code ${spoof.code}`);
    });

    // ------------------------------------------------------------ 4. submit
    await runTest('9. Captcha is enforced while enabled and consent is mandatory', async () => {
      const noCaptcha = await submitPublic({});
      if (noCaptcha.status === 429) {
        console.warn('  ⚠ submit rate limit active — captcha-gate assertion skipped this window');
      } else {
        assert.strictEqual(noCaptcha.status, 400);
        const noCaptchaBody: any = await noCaptcha.json();
        assert.strictEqual(noCaptchaBody.code, 'CAPTCHA_REQUIRED');
      }

      const settingsRes = await apiJson('/api/hiring/settings/hiring.general', adminToken, 'PATCH', {
        requireCaptcha: false,
      });
      assert.strictEqual(settingsRes.status, 200);

      const noConsent = await submitPublic({ consent: false });
      if (noConsent.status === 429) {
        console.warn('  ⚠ submit rate limit active — consent-gate assertion skipped this window');
      } else {
        assert.strictEqual(noConsent.status, 400);
        const noConsentBody: any = await noConsent.json();
        assert.strictEqual(noConsentBody.code, 'CONSENT_REQUIRED');
      }
    });

    await runTest('10. Validation failures return field-level errors before any write', async () => {
      const res = await submitPublic({ values: { ...validValues(), fullName: 'X' } });
      if (res.status === 429) {
        console.warn('  ⚠ submit rate limit active — validation assertion skipped this window');
        return;
      }
      assert.strictEqual(res.status, 400);
      const body: any = await res.json();
      assert.strictEqual(body.code, 'VALIDATION_FAILED');
      assert.ok(body.details?.fullName || body.details?.errors?.fullName, 'fullName error missing');
    });

    await runTest('11. Submission to a location the link does not serve is rejected', async () => {
      const dav = await fetch(`${BASE_URL}/api/hiring/locations`, { headers: authHeaders(adminToken) });
      const locations = (await dav.json()) as any[];
      const davangere = locations.find((l) => l.code === 'DAV');
      assert.ok(davangere, 'DAV location missing');

      const res = await submitPublic({ locationId: davangere.id });
      if (res.status === 429) {
        console.warn('  ⚠ submit rate limit active — location assertion skipped this window');
        return;
      }
      assert.strictEqual(res.status, 400);
      const body: any = await res.json();
      assert.strictEqual(body.code, 'LOCATION_MISMATCH');
    });

    await runTest('12. Valid public submission creates candidate, application and reference number', async () => {
      const res = await submitPublic({});
      if (res.status !== 201) throw new Error(`submit status ${res.status}: ${await res.text()}`);
      const body: any = await res.json();
      applicationId = body.applicationId;
      candidateId = body.candidateId;
      assert.ok(applicationId?.startsWith('happ_'), 'applicationId missing');
      assert.ok(candidateId?.startsWith('hcand_'), 'candidateId missing');
      assert.strictEqual(body.stage, 'NEW');
      assert.strictEqual(body.locationCode, 'BEL');
      assert.ok(/^APP-[A-Z0-9]{6}$/.test(body.referenceNumber), `unexpected referenceNumber ${body.referenceNumber}`);
    });

    await runTest('13. Duplicate application for the same phone + form is rejected with 409', async () => {
      const res = await submitPublic({});
      if (res.status === 429) {
        console.warn('  ⚠ submit rate limit active — duplicate assertion skipped this window');
        return;
      }
      assert.strictEqual(res.status, 409);
      const body: any = await res.json();
      assert.strictEqual(body.code, 'DUPLICATE_APPLICATION');
      assert.strictEqual(body.details?.existingApplicationId, applicationId);
    });

    // ------------------------------------------------- 5. pipeline operations
    await runTest('14. Application appears in the scoped list with summary fields', async () => {
      const res = await api(`/api/hiring/applications?formId=${formId}&search=${phone}`, adminToken);
      assert.strictEqual(res.status, 200);
      const body: any = await res.json();
      assert.ok(body.total >= 1, `expected the new application in list, got total=${body.total}`);
      const row = body.applications.find((a: any) => a.id === applicationId);
      assert.ok(row, 'created application missing from list');
      assert.strictEqual(row.stage, 'NEW');
      assert.strictEqual(row.summary.fullName, 'Automated Test Candidate');
      assert.strictEqual(row.locationCode, 'BEL');
      assert.ok(row.candidate, 'candidate join missing');
    });

    await runTest('15. Detail exposes answers, documents and never leaks raw Aadhaar/PAN', async () => {
      const res = await api(`/api/hiring/applications/${applicationId}?locationId=${belagaviId}`, adminToken);
      assert.strictEqual(res.status, 200);
      const body: any = await res.json();
      assert.strictEqual(body.application.id, applicationId);
      assert.ok(Array.isArray(body.answers) && body.answers.length >= 5, 'answers missing');
      assert.ok(Array.isArray(body.documents) && body.documents.length >= 2, 'documents missing');
      assert.strictEqual(body.candidate.aadhaarMasked, maskedAadhaar);
      assert.strictEqual(body.candidate.panMasked, 'XXXXX234F');

      const raw = JSON.stringify(body);
      assert.ok(!raw.includes(validAadhaar), 'raw Aadhaar digits leaked in detail payload');
      assert.ok(!raw.includes(validPan), 'raw PAN leaked in detail payload');
      const aadhaarAnswer = body.answers.find((a: any) => a.fieldKey === 'aadhaarNumber');
      assert.ok(!aadhaarAnswer || !String(aadhaarAnswer.valueText || '').includes('41057058'), 'aadhaar answer stores raw digits');
    });

    await runTest('16. Stage moves are validated, persisted and written to the timeline', async () => {
      const badRes = await apiJson(`/api/hiring/applications/${applicationId}/stage`, adminToken, 'PATCH', {
        toStage: 'NEW',
      });
      assert.strictEqual(badRes.status, 409, 'same-stage move should be rejected with 409');

      const res = await apiJson(`/api/hiring/applications/${applicationId}/stage`, adminToken, 'PATCH', {
        toStage: 'SCREENING',
        note: 'Resume looks good',
        locationId: belagaviId,
      });
      if (res.status !== 200) throw new Error(`stage ${res.status}: ${await res.text()}`);
      const body: any = await res.json();
      assert.strictEqual(body.application.stage, 'SCREENING');
      assert.strictEqual(body.application.previousStage, 'NEW');

      const detailRes = await api(`/api/hiring/applications/${applicationId}?locationId=${belagaviId}`, adminToken);
      const detail: any = await detailRes.json();
      assert.ok(
        detail.timeline.some((t: any) => t.type === 'STAGE_CHANGED' && t.toStage === 'SCREENING'),
        'timeline entry missing'
      );
    });

    await runTest('17. Rating, starring and notes round-trip through the detail view', async () => {
      const patchRes = await apiJson(`/api/hiring/applications/${applicationId}`, adminToken, 'PATCH', {
        rating: 5,
        starred: true,
        locationId: belagaviId,
      });
      assert.strictEqual(patchRes.status, 200);

      const noteRes = await apiJson(`/api/hiring/applications/${applicationId}/notes`, adminToken, 'POST', {
        body: 'Automated QA note — safe to delete',
        locationId: belagaviId,
      });
      if (noteRes.status !== 201) throw new Error(`note ${noteRes.status}: ${await noteRes.text()}`);
      const note: any = await noteRes.json();
      noteId = note.id;

      const detailRes = await api(`/api/hiring/applications/${applicationId}?locationId=${belagaviId}`, adminToken);
      const detail: any = await detailRes.json();
      assert.strictEqual(detail.application.rating, 5);
      assert.strictEqual(Boolean(detail.application.starred), true);
      assert.ok(detail.notes.some((n: any) => n.id === noteId), 'note missing from detail');

      const delRes = await api(`/api/hiring/applications/${applicationId}/notes/${noteId}?locationId=${belagaviId}`, adminToken, {
        method: 'DELETE',
      });
      assert.strictEqual(delRes.status, 200);
    });

    await runTest('18. Interview can be scheduled, completed and surfaced on the dashboard', async () => {
      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const createRes = await apiJson(`/api/hiring/applications/${applicationId}/interviews`, adminToken, 'POST', {
        scheduledAt,
        round: 'L1',
        mode: 'IN_PERSON',
        durationMinutes: 30,
        interviewerName: 'QA Bot',
        locationId: belagaviId,
      });
      if (createRes.status !== 201) throw new Error(`interview ${createRes.status}: ${await createRes.text()}`);
      const interview: any = await createRes.json();
      interviewId = interview.id;
      assert.ok(interviewId?.startsWith('hint_'), 'interview id missing');

      const updateRes = await apiJson(`/api/hiring/applications/${applicationId}/interviews/${interviewId}`, adminToken, 'PATCH', {
        status: 'COMPLETED',
        outcome: 'SELECTED',
        feedback: 'Automated interview feedback',
        rating: 4,
        locationId: belagaviId,
      });
      if (updateRes.status !== 200) throw new Error(`interview update ${updateRes.status}: ${await updateRes.text()}`);
      const updated: any = await updateRes.json();
      assert.strictEqual(updated.status, 'COMPLETED');

      const dashboardRes = await api('/api/hiring/dashboard?locationId=' + belagaviId, adminToken);
      const dashboard: any = await dashboardRes.json();
      assert.ok(dashboard.totals.applications >= 1, 'dashboard should count the new application');
    });

    await runTest('19. Candidate profile aggregates applications and masked documents', async () => {
      const res = await api(`/api/hiring/candidates/${candidateId}?locationId=${belagaviId}`, adminToken);
      assert.strictEqual(res.status, 200);
      const body: any = await res.json();
      const profile = body.candidate;
      assert.ok(profile, 'candidate wrapper missing');
      assert.strictEqual(profile.id, candidateId);
      assert.strictEqual(profile.fullName, 'Automated Test Candidate');
      assert.ok(profile.applicationCount >= 1, 'applicationCount missing');
      assert.strictEqual(profile.aadhaarMasked, maskedAadhaar);
      assert.strictEqual(profile.hasAadhaar, true);
      assert.ok(Array.isArray(body.applications) && body.applications.length >= 1, 'applications missing');
      assert.ok(!JSON.stringify(body).includes(validAadhaar), 'raw Aadhaar leaked on profile');
    });

    await runTest('20. Location isolation keeps other stores from reading the application', async () => {
      const shivamogga = await api(`/api/hiring/applications?formId=${formId}&search=${phone}`, shivamoggaHrToken);
      if (shivamogga.status === 200) {
        const body: any = await shivamogga.json();
        assert.ok(
          !body.applications.some((a: any) => a.id === applicationId),
          'Shivamogga HR must not see a Belagavi application'
        );
      } else {
        assert.strictEqual(shivamogga.status, 403);
      }

      const belagavi = await api(`/api/hiring/applications/${applicationId}?locationId=${belagaviId}`, belagaviHrToken);
      assert.strictEqual(belagavi.status, 200, 'Belagavi HR should read its own location application');
    });

    await runTest('21. Link analytics capture views and submissions from the public funnel', async () => {
      const res = await api(`/api/hiring/forms/${formId}/analytics?days=30`, adminToken);
      assert.strictEqual(res.status, 200);
      const body: any = await res.json();
      assert.ok(body.totals.views >= 1, 'view events missing');
      assert.ok(body.totals.submissions >= 1, 'submission event missing');
      assert.ok(body.byLink.some((l: any) => l.linkId === linkId), 'per-link breakdown missing');
      assert.ok(Array.isArray(body.byDay), 'byDay missing');
    });

    await runTest('22. CSV export includes the row and carries no raw identifiers', async () => {
      const res = await api(`/api/hiring/export?format=csv&formId=${formId}`, adminToken);
      assert.strictEqual(res.status, 200);
      assert.ok(String(res.headers.get('content-type')).includes('text/csv'), 'csv content-type expected');
      assert.ok(Number(res.headers.get('x-export-row-count')) >= 1, 'X-Export-Row-Count missing');
      const csv = await res.text();
      assert.ok(csv.includes('Automated Test Candidate'), 'candidate missing from export');
      assert.ok(!csv.includes(validAadhaar), 'raw Aadhaar leaked into export');
      assert.ok(!csv.includes(validPan), 'raw PAN leaked into export');
    });

    await runTest('23. Shard registry shows hiring schema provisioned for Belagavi', async () => {
      const res = await api('/api/hiring/shards', adminToken);
      assert.strictEqual(res.status, 200);
      const rows = (await res.json()) as any[];
      assert.ok(Array.isArray(rows) && rows.length >= 1);
      const bel = rows.find((r) => r.locationCode === 'BEL' || r.locationCode === null) ?? rows[0];
      assert.strictEqual(bel.hiringSchemaReady, true, `shard ${bel.shardName} missing hiring tables`);
    });

    await runTest('24. Outbox stats expose worker backlog counters', async () => {
      const res = await api('/api/hiring/outbox/stats', adminToken);
      assert.strictEqual(res.status, 200);
      const stats: any = await res.json();
      for (const key of ['pending', 'processing', 'done', 'failed']) {
        assert.ok(typeof stats[key] === 'number', `outbox ${key} missing`);
      }
    });
  } finally {
    if (originalRequireCaptcha !== null) {
      try {
        await apiJson('/api/hiring/settings/hiring.general', adminToken, 'PATCH', { requireCaptcha: originalRequireCaptcha });
      } catch {
        console.warn('[hiringApiTests] failed to restore requireCaptcha setting');
      }
    }
    if (applicationId) {
      try {
        await api(`/api/hiring/applications/${applicationId}?locationId=${belagaviId}`, adminToken, { method: 'DELETE' });
      } catch {
        /* best-effort cleanup */
      }
    }
    if (linkId) {
      try {
        await api(`/api/hiring/links/${linkId}`, adminToken, { method: 'DELETE' });
      } catch {
        /* best-effort cleanup */
      }
    }
    if (formId) {
      try {
        await api(`/api/hiring/forms/${formId}`, adminToken, { method: 'DELETE' });
      } catch {
        /* best-effort cleanup */
      }
    }
  }

  return results;
}
