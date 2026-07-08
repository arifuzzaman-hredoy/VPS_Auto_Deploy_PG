export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export function isValidHostname(hostname: string): boolean {
  if (hostname.length > 253) return false;
  if (hostname.startsWith('*.')) return isValidHostname(hostname.slice(2));
  return /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(hostname);
}

export function assertSafeDatabaseIdentifier(value: string, label: string): void {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(value)) {
    throw new Error(`${label} must start with a letter and contain only lowercase letters, numbers, and underscores.`);
  }
  const blocked = new Set(['postgres', 'root', 'admin', 'template0', 'template1']);
  if (blocked.has(value)) throw new Error(`${label} is reserved.`);
}
