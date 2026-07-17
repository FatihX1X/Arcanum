import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Arcanum',
  description: 'Private on-chain messaging on Arc Network',
};

const themeInitScript = `
  (() => {
    try {
      const stored = localStorage.getItem('arcanum.theme');
      const theme = stored === 'light' || stored === 'dark'
        ? stored
        : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = 'dark';
    }
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
