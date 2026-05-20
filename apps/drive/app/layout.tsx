import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anvil Drive",
  description: "File storage and sharing",
};

export default function DriveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex h-screen bg-gray-50">
          {/* Sidebar */}
          <aside className="w-64 border-r border-gray-200 bg-white flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h1 className="text-xl font-bold text-gray-900">Anvil Drive</h1>
            </div>
            <nav className="flex-1 p-2 space-y-1">
              <a href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 font-medium">
                <span>📁</span>
                <span>My Drive</span>
              </a>
              <a href="/shared" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                <span>🔗</span>
                <span>Shared with me</span>
              </a>
              <a href="/trash" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                <span>🗑️</span>
                <span>Trash</span>
              </a>
            </nav>
            <div className="p-4 border-t border-gray-200">
              <div className="text-xs text-gray-400">
                Storage: 0 MB / 15 GB
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
