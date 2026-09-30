import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Arcanum',
    template: '%s · Arcanum',
  },
  description: 'Private communication and settlement on Arc Network',
  icons: {
    icon: '/arcanum-coin.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" data-theme="pixel" style={{ colorScheme: 'dark' }}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
