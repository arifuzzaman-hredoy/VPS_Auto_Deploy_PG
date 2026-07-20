import { prisma } from './prisma.js';

export type AuditInput = {
  action: string;
  target: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

function toJsonValue(value: Record<string, unknown> | undefined): unknown {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      target: input.target,
      actorId: input.actorId ?? null,
      metadata: toJsonValue(input.metadata) as never,
    },
  });
}

export function extractProjectIdFromPath(path: string): string | null {
  const match = path.match(/\/api\/projects\/([^/?]+)/);
  return match?.[1] ?? null;
}
