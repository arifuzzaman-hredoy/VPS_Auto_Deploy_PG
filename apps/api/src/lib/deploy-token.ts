import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createDeployToken(projectSlug: string): { token: string; hash: string; prefix: string } {
  const prefix = `dep_live_${projectSlug.slice(0, 20)}_`;
  const token = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashDeployToken(token), prefix };
}

export function hashDeployToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyDeployToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashDeployToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
