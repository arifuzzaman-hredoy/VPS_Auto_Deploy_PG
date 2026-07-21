import { prisma } from '../../lib/prisma.js';
import {
  getGitHubInstallation,
  listGitHubInstallationRepositories,
} from '../../lib/github-app.js';

export async function syncGitHubInstallation(installationId: string) {
  const remoteInstallation = await getGitHubInstallation(installationId);
  const repositories = await listGitHubInstallationRepositories(installationId);

  const installation = await prisma.gitHubInstallation.upsert({
    where: { externalId: String(remoteInstallation.id) },
    create: {
      externalId: String(remoteInstallation.id),
      accountId: String(remoteInstallation.account.id),
      accountLogin: remoteInstallation.account.login,
      accountType: remoteInstallation.account.type,
      targetType: remoteInstallation.target_type || null,
      repositorySelection: remoteInstallation.repository_selection,
      status: remoteInstallation.suspended_at ? 'SUSPENDED' : 'ACTIVE',
    },
    update: {
      accountId: String(remoteInstallation.account.id),
      accountLogin: remoteInstallation.account.login,
      accountType: remoteInstallation.account.type,
      targetType: remoteInstallation.target_type || null,
      repositorySelection: remoteInstallation.repository_selection,
      status: remoteInstallation.suspended_at ? 'SUSPENDED' : 'ACTIVE',
    },
  });

  for (const repository of repositories) {
    await prisma.gitHubRepository.upsert({
      where: { githubId: String(repository.id) },
      create: {
        installationId: installation.id,
        githubId: String(repository.id),
        fullName: repository.full_name.toLowerCase(),
        ownerLogin: repository.owner.login,
        name: repository.name,
        private: repository.private,
        archived: repository.archived,
        disabled: repository.disabled,
        defaultBranch: repository.default_branch || 'main',
        htmlUrl: repository.html_url,
        cloneUrl: repository.clone_url,
        sshUrl: repository.ssh_url,
        githubUpdatedAt: repository.updated_at ? new Date(repository.updated_at) : null,
      },
      update: {
        installationId: installation.id,
        fullName: repository.full_name.toLowerCase(),
        ownerLogin: repository.owner.login,
        name: repository.name,
        private: repository.private,
        archived: repository.archived,
        disabled: repository.disabled,
        defaultBranch: repository.default_branch || 'main',
        htmlUrl: repository.html_url,
        cloneUrl: repository.clone_url,
        sshUrl: repository.ssh_url,
        githubUpdatedAt: repository.updated_at ? new Date(repository.updated_at) : null,
      },
    });
  }

  const activeIds = repositories.map((repository) => String(repository.id));
  await prisma.gitHubRepository.deleteMany({
    where: {
      installationId: installation.id,
      ...(activeIds.length ? { githubId: { notIn: activeIds } } : {}),
    },
  });

  return prisma.gitHubInstallation.findUniqueOrThrow({
    where: { id: installation.id },
    include: { repositories: { orderBy: { fullName: 'asc' } } },
  });
}

export async function markGitHubInstallationDeleted(installationId: string): Promise<void> {
  await prisma.$transaction([
    prisma.gitHubInstallation.updateMany({ where: { externalId: installationId }, data: { status: 'DELETED' } }),
    prisma.project.updateMany({
      where: { githubInstallationId: installationId, deploymentMethod: 'GITHUB_APP' },
      data: { autoDeployEnabled: false, status: 'GITHUB_APP_DISCONNECTED' },
    }),
  ]);
}
