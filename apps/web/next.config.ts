import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
};

export default nextConfig;
