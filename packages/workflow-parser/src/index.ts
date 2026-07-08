import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface WorkflowValidationResult {
  found: boolean;
  path?: string;
  valid: boolean;
  warnings: string[];
  branches: string[];
}

export function detectDeployWorkflow(repoRoot: string): WorkflowValidationResult {
  const workflowsDir = join(repoRoot, '.github', 'workflows');
  if (!existsSync(workflowsDir)) {
    return { found: false, valid: false, warnings: ['No .github/workflows directory found.'], branches: [] };
  }

  const files = readdirSync(workflowsDir).filter((file) => /\.ya?ml$/i.test(file));
  for (const file of files) {
    const path = join(workflowsDir, file);
    const content = readFileSync(path, 'utf8');
    const looksLikeDeployOs = content.includes('DEPLOY_API_URL') && content.includes('DEPLOY_TOKEN') && content.includes('/api/deployments/trigger');
    if (!looksLikeDeployOs) continue;

    const warnings: string[] = [];
    if (/VPS_SSH_KEY|VPS_HOST|ssh\s+-i/.test(content)) {
      warnings.push('Workflow contains direct VPS SSH references. Recommended mode should only call Deploy OS API.');
    }
    if (/DEPLOY_TOKEN\s*[:=]\s*['\"][^$]/.test(content)) {
      warnings.push('DEPLOY_TOKEN may be hardcoded. Use GitHub repository secrets.');
    }
    if (/echo\s+.*\$\{\{\s*secrets\./.test(content)) {
      warnings.push('Workflow appears to echo secrets. This is unsafe.');
    }

    const branchMatches = [...content.matchAll(/branches:\s*\n(?:\s+-\s+([^\n]+)\n?)+/g)].flatMap((match) => match[0].split('\n').map((line) => line.trim().replace(/^-\s*/, '')).filter((line) => line && line !== 'branches:'));

    return {
      found: true,
      path,
      valid: warnings.length === 0,
      warnings,
      branches: branchMatches.length > 0 ? branchMatches : ['main']
    };
  }

  return { found: false, valid: false, warnings: ['No Deploy OS workflow found.'], branches: [] };
}
