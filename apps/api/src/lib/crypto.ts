import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function getKey(): Buffer {
  const raw = process.env.DEPLOY_OS_ENCRYPTION_KEY ?? 'dev-only-change-this-key';
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
