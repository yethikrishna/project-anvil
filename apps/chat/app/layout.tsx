import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anvil Chat — AI Command Center',
  description: 'Intelligent assistant across Mail, Drive, Calendar, and Docs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
