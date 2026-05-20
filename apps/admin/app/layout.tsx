import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil Admin Console',
  description: 'Team management, usage analytics, and audit logs',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
