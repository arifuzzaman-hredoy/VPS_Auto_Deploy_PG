'use client';

import type { ReactNode } from 'react';

type AccessContext = {
  token: string;
  lock: () => void;
  handleUnauthorized: () => void;
};

type AdminAccessGateProps = {
  children: (context: AccessContext) => ReactNode;
};

const noop = () => undefined;

export function AdminAccessGate({ children }: AdminAccessGateProps) {
  return children({
    token: '',
    lock: noop,
    handleUnauthorized: noop,
  });
}
