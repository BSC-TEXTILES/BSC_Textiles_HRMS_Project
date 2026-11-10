const { pool } = require('./src/nativeDb.ts');

async function fixMissingTables() {
  // Create cookie_consent table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`cookie_consent\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`visitorId\` VARCHAR(191) NOT NULL,
        \`necessary\` TINYINT(1) NOT NULL DEFAULT 1,
        \`analytics\` TINYINT(1) NOT NULL DEFAULT 0,
        \`marketing\` TINYINT(1) NOT NULL DEFAULT 0,
        \`preferences\` TINYINT(1) NOT NULL DEFAULT 0,
        \`userId\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY \`idx_cookie_consent_visitor\` (\`visitorId\`),
        KEY \`idx_cookie_consent_user\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('cookie_consent table created');
  } catch (err) {
    console.error('cookie_consent error:', err.message);
  }
  
  // Add isActive column to role table
  try {
    await pool.query('ALTER TABLE \`role\` ADD COLUMN \`isActive\` TINYINT(1) NOT NULL DEFAULT 1');
    console.log('isActive column added to role table');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
      console.log('isActive column already exists');
    } else {
      console.error('isActive error:', err.message);
    }
  }
  
  // Add expiresAt column to notification table
  try {
    await pool.query('ALTER TABLE \`notification\` ADD COLUMN \`expiresAt\` DATETIME(3) NULL');
    console.log('expiresAt column added to notification table');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
      console.log('expiresAt column already exists');
    } else {
      console.error('expiresAt error:', err.message);
    }
  }
  
  await pool.end();
  process.exit(0);
}

fixMissingTables().catch(e => { console.error(e); process.exit(1); });