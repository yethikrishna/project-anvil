import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Anvil Marketplace — Plugins & Extensions',
  description: 'Discover and install plugins for the Anvil ecosystem',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
