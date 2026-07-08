export type SourceType = 'GITHUB' | 'ZIP';
export type DeploymentStatus =
  | 'CREATED'
  | 'WAITING_FOR_DEPLOY_KEY'
  | 'REPO_CLONED'
  | 'YAML_DETECTED'
  | 'ENV_UPLOADED'
  | 'DATABASE_PROVISIONED'
  | 'FRAMEWORK_DETECTED'
  | 'QUEUED'
  | 'INSTALLING_DEPENDENCIES'
  | 'PRISMA_GENERATE'
  | 'DATABASE_MIGRATION'
  | 'BUILDING_IMAGE'
  | 'STARTING_CONTAINER'
  | 'HEALTH_CHECKING'
  | 'UPDATING_PROXY'
  | 'LIVE'
  | 'FAILED';

export type DomainType =
  | 'DEFAULT_SUBDOMAIN'
  | 'MAIN_DOMAIN'
  | 'SUBDOMAIN'
  | 'WILDCARD_SUBDOMAIN'
  | 'SAAS_TENANT_WILDCARD';

export type DnsSetupMethod = 'API_AUTO' | 'CUSTOM_MANUAL' | 'MANAGED_NAMESERVER';
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT';

export interface FrameworkDetectionResult {
  framework: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  hasPrisma: boolean;
  databaseRequired: boolean;
  workflowDetected: boolean;
  dockerStrategy: 'custom-dockerfile' | 'generated-dockerfile' | 'static' | 'manual-required';
}

export interface DnsRecordPlan {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  purpose: 'ROUTE' | 'OWNERSHIP' | 'SSL_CHALLENGE';
}

export interface DeploymentTriggerPayload {
  repository: string;
  branch: string;
  commit: string;
  runId?: string;
}
