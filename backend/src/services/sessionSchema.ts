/** A successful connection alone does not mean the login schema was installed. */
export async function assertSessionSchema(query: (sql: string) => Promise<unknown>): Promise<void> {
  await query('SELECT id, loginId, passwordHash, status, tokenVersion FROM `user` LIMIT 0');
  for (const table of ['cookie_consent', 'session', 'refresh_token']) {
    await query(`SELECT id FROM \`${table}\` LIMIT 0`);
  }
  await query('SELECT kid FROM `jwt_signing_key` LIMIT 0');
}
