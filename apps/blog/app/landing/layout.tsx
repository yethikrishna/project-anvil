import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil — Open Source Google Workspace Alternative',
  description: 'Self-hosted productivity suite: Docs, Drive, Gmail, Calendar, and more. Privacy-first, open source, enterprise-ready.',
  openGraph: {
    title: 'Anvil — Open Source Google Workspace Alternative',
    description: 'Self-hosted productivity suite with real-time collaboration.',
    type: 'website',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
