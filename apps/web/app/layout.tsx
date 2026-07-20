import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hredoy Deploy OS',
  description: 'Hredoy Deploy OS — self-hosted DevOps deployment control panel',
};

const themeScript = `
(function () {
  try {
    var saved = localStorage.getItem('hredoy-deploy-os-theme');
    var theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
