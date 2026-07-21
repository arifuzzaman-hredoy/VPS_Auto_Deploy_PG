import { createDecipheriv, createHash } from 'node:crypto';

function getKey(): Buffer {
  const raw = process.env.DEPLOY_OS_ENCRYPTION_KEY;
  if (!raw) throw new Error('DEPLOY_OS_ENCRYPTION_KEY is missing in the runner environment.');
  return createHash('sha256').update(raw).digest();
}

export function decryptSecret(payload: string): string {
  const data = Buffer.from(payload, 'base64');
  if (data.length < 29) throw new Error('Encrypted secret payload is invalid.');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
