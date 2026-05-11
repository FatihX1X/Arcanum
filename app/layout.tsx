import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arcanum - Private Messaging on Arc',
  description: 'Fully on-chain private messenger on Arc Network',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="bg-zinc-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
