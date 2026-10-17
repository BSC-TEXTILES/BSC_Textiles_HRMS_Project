/**
 * JWT signing keys: generated on the server, stored encrypted, rotated by kid.
 *
 * Asymmetric signing (ES256 by default, RS256 optional) means the public half
 * can be published at /.well-known/jwks.json for any verifier — including the
 * Next.js middleware — without handing out the ability to mint tokens.
 *
 * Private keys are sealed with AES-256-GCM under a key derived from
 * TOKEN_KEY_ENCRYPTION_KEY (or PASSWORD_PEPPER when that is unset) before they
 * touch the database, so a SQL dump is not a signing-key dump.
 */
import crypto from 'node:crypto';
import { pool } from '../nativeDb.js';
import { securityConfig, readSecretValue } from '../config/security.js';

export interface SigningKeyRecord {
  kid: string;
  algorithm: string;
  status: 'active' | 'retiring' | 'retired';
  publicKeyPem: string;
  createdAt: Date;
  expiresAt: Date | null;
}

interface LoadedKey extends SigningKeyRecord {
  privateKeyPem: string;
}

let cache: { active: LoadedKey | null; verify: Map<string, string>; fetchedAt: number } = {
  active: null,
  verify: new Map(),
  fetchedAt: 0,
};

const CACHE_TTL_MS = 30_000;

function encryptionKey(): Buffer {
  const secret =
    readSecretValue('TOKEN_KEY_ENCRYPTION_KEY') || securityConfig.password.pepper;
  return crypto.scryptSync(secret, 'bsc-hrms-jwt-key-wrap', 32);
}

function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

function open(sealed: string): string {
  const [iv, tag, data] = sealed.split('.');
  if (!iv || !tag || !data) throw new Error('Malformed sealed key');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

function generateKeyPair(algorithm: string): { publicKeyPem: string; privateKeyPem: string } {
  if (algorithm === 'RS256') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

function newKid(): string {
  return `${securityConfig.tokens.algorithm.slice(0, 2).toLowerCase()}_${Date.now().toString(36)}${crypto
    .randomBytes(4)
    .toString('hex')}`;
}

async function insertKey(algorithm: string): Promise<void> {
  const { publicKeyPem, privateKeyPem } = generateKeyPair(algorithm);
  const kid = newKid();
  const expiresAt = new Date(Date.now() + securityConfig.tokens.keyRotationDays * 86400_000);
  await pool.query(
    `INSERT INTO \`jwt_signing_key\` (\`kid\`, \`algorithm\`, \`publicKeyPem\`, \`privateKeyPem\`, \`status\`, \`activatedAt\`, \`expiresAt\`)
     VALUES (?, ?, ?, ?, 'active', NOW(3), ?)`,
    [kid, algorithm, publicKeyPem, seal(privateKeyPem), expiresAt]
  );
}

/**
 * Makes sure an active signing key exists, rotating the current one when it has
 * passed its expiry. Called on boot and lazily before signing.
 */
export async function ensureActiveKey(actorId?: string): Promise<LoadedKey> {
  const algorithm = securityConfig.tokens.algorithm;
  const now = Date.now();

  if (cache.active && cache.active.algorithm === algorithm && now - cache.fetchedAt < CACHE_TTL_MS) {
    const expired = cache.active.expiresAt && cache.active.expiresAt.getTime() < now;
    if (!expired) return cache.active;
  }

  const [rows]: any = await pool.query(
    `SELECT \`kid\`, \`algorithm\`, \`status\`, \`publicKeyPem\`, \`privateKeyPem\`, \`createdAt\`, \`expiresAt\`
       FROM \`jwt_signing_key\` WHERE \`status\` = 'active' AND \`algorithm\` = ? LIMIT 1`,
    [algorithm]
  );

  const existing = rows?.[0];
  const needsRotation =
    !existing || (existing.expiresAt && new Date(existing.expiresAt).getTime() < now) || existing.privateKeyPem == null;

  if (needsRotation) {
    if (existing) {
      // The outgoing key keeps verifying for its grace period so in-flight
      // access tokens are not cut off mid-request.
      const graceUntil = new Date(now + securityConfig.tokens.keyGraceSeconds * 1000);
      await pool.query(
        'UPDATE `jwt_signing_key` SET `status` = `retiring`, `retiredAt` = NOW(3), `expiresAt` = ?, `rotatedById` = ? WHERE `kid` = ?',
        [graceUntil, actorId || null, existing.kid]
      );
    }
    await insertKey(algorithm);
    cache = { active: null, verify: new Map(), fetchedAt: 0 };
    if (existing) console.log(`[signingKeys] rotated ${existing.kid} → new ${algorithm} key`);
  }

  const [activeRows]: any = await pool.query(
    `SELECT \`kid\`, \`algorithm\`, \`status\`, \`publicKeyPem\`, \`privateKeyPem\`, \`createdAt\`, \`expiresAt\`
       FROM \`jwt_signing_key\` WHERE \`status\` = 'active' AND \`algorithm\` = ? ORDER BY \`activatedAt\` DESC LIMIT 1`,
    [algorithm]
  );
  if (!activeRows?.length) throw new Error('[signingKeys] no active signing key could be established');

  const row = activeRows[0];
  const key: LoadedKey = {
    kid: row.kid,
    algorithm: row.algorithm,
    status: row.status,
    publicKeyPem: row.publicKeyPem,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    privateKeyPem: open(row.privateKeyPem),
  };
  cache = { active: key, verify: new Map(), fetchedAt: Date.now() };
  return key;
}

/** Public key PEM for a kid — active, retiring or within its grace period. */
export async function getVerifyKey(kid: string): Promise<string | null> {
  const cached = cache.verify.get(kid);
  if (cached && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cached;

  const [rows]: any = await pool.query(
    `SELECT \`publicKeyPem\` FROM \`jwt_signing_key\`
      WHERE \`kid\` = ? AND (\`status\` IN ('active','retiring') OR (\`status\` = 'retired' AND \`expiresAt\` > NOW(3)))`,
    [kid]
  );
  if (!rows?.length) return null;
  const pem = rows[0].publicKeyPem;
  cache.verify.set(kid, pem);
  return pem;
}

/** RFC 7517 key set. Only public material is ever returned. */
export async function getJwks(): Promise<Record<string, unknown>[]> {
  const [rows]: any = await pool.query(
    `SELECT \`kid\`, \`algorithm\`, \`publicKeyPem\` FROM \`jwt_signing_key\`
      WHERE \`status\` IN ('active','retiring') OR (\`status\` = 'retired' AND \`expiresAt\` > NOW(3))`
  );
  const keys: Record<string, unknown>[] = [];
  for (const row of rows || []) {
    try {
      const jwk = crypto.createPublicKey(row.publicKeyPem).export({ format: 'jwk' });
      keys.push({
        ...jwk,
        kid: row.kid,
        use: 'sig',
        alg: row.algorithm,
      });
    } catch (err: any) {
      console.warn(`[signingKeys] could not publish kid ${row.kid}: ${err?.message}`);
    }
  }
  return keys;
}

/** Forces rotation; the Admin endpoint and the boot check both call this. */
export async function rotateNow(actorId?: string): Promise<{ previousKid: string | null; kid: string }> {
  const [current]: any = await pool.query(
    "SELECT `kid` FROM `jwt_signing_key` WHERE `status` = 'active' LIMIT 1",
  );
  cache = { active: null, verify: new Map(), fetchedAt: 0 };
  await ensureActiveKey(actorId);
  const key = await ensureActiveKey(actorId);
  return { previousKid: current?.[0]?.kid ?? null, kid: key.kid };
}

export async function listKeys(): Promise<SigningKeyRecord[]> {
  const [rows]: any = await pool.query(
    `SELECT \`kid\`, \`algorithm\`, \`status\`, \`publicKeyPem\`, \`createdAt\`, \`expiresAt\`
       FROM \`jwt_signing_key\` ORDER BY \`createdAt\` DESC`
  );
  return (rows || []).map((r: any) => ({
    kid: r.kid,
    algorithm: r.algorithm,
    status: r.status,
    publicKeyPem: r.publicKeyPem,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

export function signingKeyHealth(): { kid: string | null; algorithm: string; cachedAt: number } {
  return {
    kid: cache.active?.kid ?? null,
    algorithm: securityConfig.tokens.algorithm,
    cachedAt: cache.fetchedAt,
  };
}
