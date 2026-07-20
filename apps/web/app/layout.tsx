import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hredoy Deploy OS',
  description: 'Hredoy Deploy OS — self-hosted DevOps deployment control panel'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
