import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arcanum',
  description: 'Private on-chain messaging on Arc Network',
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