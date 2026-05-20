'use client';

import {AppShell, Button, Card} from '@anvil/ui';

interface DocumentItem {
  id: string;
  title: string;
  updated: string;
  collaborators: number;
  type: 'doc' | 'sheet';
}

const MOCK_DOCS: DocumentItem[] = [
  {id: '1', title: 'Project Anvil — Architecture Spec', updated: '2 min ago', collaborators: 3, type: 'doc'},
  {id: '2', title: 'Sprint Planning — Week 21', updated: '1 hour ago', collaborators: 2, type: 'doc'},
  {id: '3', title: 'API Contract — v0.2', updated: 'Yesterday', collaborators: 1, type: 'doc'},
  {id: '4', title: 'Budget Tracker', updated: '3 days ago', collaborators: 1, type: 'sheet'},
  {id: '5', title: 'Meeting Notes — May 20', updated: 'Last week', collaborators: 5, type: 'doc'},
];

export default function DocsPage() {
  return (
    <AppShell activeApp="docs">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">My Documents</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">+ New Sheet</Button>
            <Button size="sm">+ New Document</Button>
          </div>
        </div>

        <div className="space-y-2">
          {MOCK_DOCS.map(doc => (
            <Card key={doc.id} onClick={() => {}}>
              <div className="flex items-center gap-4">
                <span className="text-2xl">{doc.type === 'sheet' ? '📊' : '📝'}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                  <p className="text-xs text-gray-500">
                    Opened {doc.updated} • {doc.collaborators} collaborator{doc.collaborators > 1 ? 's' : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm">Open</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
