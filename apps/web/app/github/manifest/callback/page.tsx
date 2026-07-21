import { Suspense } from 'react';
import { GitHubManifestCallbackClient } from './GitHubManifestCallbackClient';

export const dynamic = 'force-dynamic';

export default function GitHubManifestCallbackPage() {
  return (
    <Suspense fallback={<div className="empty-state">Completing GitHub App registration…</div>}>
      <GitHubManifestCallbackClient />
    </Suspense>
  );
}
