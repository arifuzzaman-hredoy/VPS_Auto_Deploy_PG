import { Suspense } from 'react';
import { GitHubSetupClient } from './GitHubSetupClient';

export const dynamic = 'force-dynamic';

export default function GitHubSetupPage() {
  return (
    <Suspense fallback={<div className="empty-state">Preparing GitHub connection…</div>}>
      <GitHubSetupClient />
    </Suspense>
  );
}
