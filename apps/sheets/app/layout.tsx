import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil Sheets',
  description: 'Google Sheets clone — part of Project Anvil',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
