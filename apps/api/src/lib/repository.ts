export type GitHubRepository = {
  fullName: string;
  sshUrl: string;
  httpsUrl: string;
};

export function parseGitHubRepository(input: string): GitHubRepository {
  const value = input.trim().replace(/\/$/, '');
  let path = '';

  if (/^git@github\.com:/i.test(value)) {
    path = value.replace(/^git@github\.com:/i, '');
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Enter a valid GitHub repository URL.');
    }
    if (url.hostname.toLowerCase() !== 'github.com') {
      throw new Error('Only github.com repositories are supported in this release.');
    }
    path = url.pathname.replace(/^\//, '');
  }

  path = path.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 2 || !/^[A-Za-z0-9_.-]+$/.test(parts[0] ?? '') || !/^[A-Za-z0-9_.-]+$/.test(parts[1] ?? '')) {
    throw new Error('GitHub repository must use the owner/repository format.');
  }

  const fullName = `${parts[0]}/${parts[1]}`;
  return {
    fullName,
    sshUrl: `git@github.com:${fullName}.git`,
    httpsUrl: `https://github.com/${fullName}.git`,
  };
}

export function normalizeRepositoryFullName(value: string): string {
  const trimmed = value.trim().replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) return trimmed.toLowerCase();
  return parseGitHubRepository(value).fullName.toLowerCase();
}
