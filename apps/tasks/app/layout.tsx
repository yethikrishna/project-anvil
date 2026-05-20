import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil Tasks',
  description: 'Cross-app task management with smart creation',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
