/**
 * Anvil Photos — Root Layout
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil Photos',
  description: 'Your photos, beautifully organized',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-neutral-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
