import { UserUploadService } from '../services/userUploadService.js';
import { pool } from '../nativeDb.js';

async function main() {
  console.log('--- Syncing User Upload Folders ---');
  const count = await UserUploadService.syncAllUserFolders();
  console.log(`Successfully ensured folders for ${count} users/employees.`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
