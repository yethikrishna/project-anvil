'use client';

import {AppShell, Button, Card, Badge} from '@anvil/ui';

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  mime?: string;
  size?: number;
  updated: string;
  shared: boolean;
}

const MOCK_FILES: FileItem[] = [
  {id: '1', name: 'Projects', type: 'folder', updated: '2026-05-19', shared: true},
  {id: '2', name: 'Photos', type: 'folder', updated: '2026-05-18', shared: false},
  {id: '3', name: 'Documents', type: 'folder', updated: '2026-05-17', shared: true},
  {id: '4', name: 'resume.pdf', type: 'file', mime: 'application/pdf', size: 245000, updated: '2026-05-20', shared: false},
  {id: '5', name: 'budget-2026.xlsx', type: 'file', mime: 'application/vnd.ms-excel', size: 128000, updated: '2026-05-15', shared: true},
  {id: '6', name: 'presentation.pptx', type: 'file', mime: 'application/vnd.ms-powerpoint', size: 3200000, updated: '2026-05-14', shared: false},
];

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(item: FileItem): string {
  if (item.type === 'folder') return '📁';
  const mime = item.mime ?? '';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('video')) return '🎬';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
  return '📄';
}

export default function DrivePage() {
  return (
    <AppShell activeApp="drive">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Drive</h2>
            <p className="text-sm text-gray-500 mt-1">2.4 GB of 15 GB used</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              + New Folder
            </Button>
            <Button size="sm">
              + Upload File
            </Button>
          </div>
        </div>

        {/* Storage bar */}
        <div className="mb-6">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{width: '16%'}} />
          </div>
        </div>

        {/* File grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MOCK_FILES.map(file => (
            <Card key={file.id} onClick={() => {}}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{getFileIcon(file)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      {file.type === 'file' ? formatSize(file.size) : 'Folder'}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500">{file.updated}</span>
                  </div>
                  {file.shared && (
                    <Badge variant="success" className="mt-2">Shared</Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
