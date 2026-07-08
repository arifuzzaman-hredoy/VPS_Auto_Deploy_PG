import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TechTeam Deploy OS',
  description: 'Self-hosted VPS deployment control panel'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
