import type {Metadata} from 'next';
import './globals.css';
import {AppShell} from '@anvil/ui';

export const metadata: Metadata = {
  title: 'Anvil Blog — Engineering & Updates',
  description: 'Project Anvil development blog, changelog, and engineering deep-dives.',
};

export default function BlogLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
