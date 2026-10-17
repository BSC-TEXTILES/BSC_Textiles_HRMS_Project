/**
 * Seed a ready-to-share demo hiring form for local development.
 *
 * Idempotent: if a published form with the demo title already exists, its
 * share link is reused (or created on the first run). Safe to run repeatedly.
 *
 *   npm run seed:hiring-demo
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });

import { shardManager } from '../core/sharding/index.js';
import {
  createForm,
  getActiveHiringLocations,
  listForms,
  publishForm,
} from '../services/hiring/hiringFormService.js';
import { createLink, listLinks } from '../services/hiring/hiringLinkService.js';

const DEMO_TITLE = 'Store Sales Associate';
const DEMO_JOB_TITLE = 'Store Sales Associate';

async function main(): Promise<void> {
  await shardManager.initialize();

  const actor = { id: 'system-seed', fullName: 'Seed Script' };
  const locations = await getActiveHiringLocations();
  if (locations.length === 0) {
    console.error('No active hiring locations found. Provision locations first.');
    process.exitCode = 1;
    return;
  }

  const existing = await listForms({ search: DEMO_TITLE, limit: 20 });
  const demo = (existing.forms as any[]).find(
    (f) => f.title === DEMO_TITLE && f.status === 'PUBLISHED' && !f.deletedAt
  );

  let formId: string;
  if (demo) {
    formId = demo.id;
    console.log(`Using existing published form ${formId}`);
  } else {
    const form = await createForm(
      {
        title: DEMO_TITLE,
        jobTitle: DEMO_JOB_TITLE,
        jobDescription:
          'Serve customers, maintain counters and visual merchandising at a BSC Textiles showroom.',
        employmentType: 'FULL_TIME',
        experienceLevel: 'Fresher / 0-2 years',
        qualification: 'PUC / 10th Pass',
        salaryMin: 14000,
        salaryMax: 19000,
        openings: 4,
        locationIds: locations.map((l) => l.id),
        allowOtherLocations: true,
        templateSlug: 'RETAIL_STORE_STAFF',
      },
      actor
    );
    formId = form.id;
    await publishForm(formId, actor);
    console.log(`Created and published ${formId}`);
  }

  const links = await listLinks(formId);
  let link = (links as any[]).find((l) => l.enabled && l.allowApplications);
  if (!link) {
    link = await createLink(formId, { label: 'Walk-in / counter QR', enabled: true, allowApplications: true }, actor);
    console.log('Created share link');
  }

  console.log('\n--- Hiring demo ready ---');
  console.log(`Form:   ${DEMO_TITLE} (${formId})`);
  console.log(`Code:   ${link.code}`);
  console.log(`Public: http://localhost:3000/apply/${link.code}`);
  console.log('');
}

main()
  .then(async () => {
    await shardManager.shutdown();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed failed:', err?.message || err);
    await shardManager.shutdown().catch(() => {});
    process.exit(1);
  });
