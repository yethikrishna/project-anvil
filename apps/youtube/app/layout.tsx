import type {Metadata} from 'next';
import {SessionProvider} from '@anvil/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil Video',
  description: 'Video streaming — Anvil ecosystem',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
