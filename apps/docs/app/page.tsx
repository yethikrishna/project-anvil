'use client';

import {useState, useEffect} from 'react';
import {AppShell, Button, Card, Input, ThemeProvider, ThemeToggle} from '@anvil/ui';
import {useAuth} from '@anvil/auth';
import {NotificationProvider, NotificationBell} from '@anvil/notifications';
import {TemplatePicker} from './templates/TemplatePicker';
import {type DocumentTemplate} from './templates/definitions';

interface DocumentItem {
  id: string;
  title: string;
  updatedAt: string;
  collaborators: {id: string; name: string; color: string}[];
  ownerId: string;
}

export default function DocsPage() {
  const {user, isAuthenticated, login} = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Fetch documents
  useEffect(() => {
    if (!isAuthenticated) return;

    fetch('/api/documents')
      .then(r => r.json())
      .then(data => {
        setDocuments(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [isAuthenticated]);

  // Create new document
  const createDocument = async (title?: string) => {
    setIsCreating(true);
    try {
      const resp = await fetch('/api/documents', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: title ?? 'Untitled Document'}),
      });
      const doc = await resp.json();
      window.location.href = `/editor/${doc.id}`;
    } finally {
      setIsCreating(false);
    }
  };

  // Create document from template
  const createFromTemplate = async (template: DocumentTemplate) => {
    setIsCreating(true);
    setShowTemplates(false);
    try {
      const resp = await fetch('/api/documents/from-template', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({templateId: template.id, title: template.title}),
      });
      const doc = await resp.json();
      window.location.href = `/editor/${doc.id}`;
    } finally {
      setIsCreating(false);
    }
  };

  // Delete document
  const deleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this document?')) return;

    await fetch(`/api/documents/${id}`, {method: 'DELETE'});
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  // Filter documents
  const filteredDocs = documents.filter(d =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format relative time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  if (!isAuthenticated) {
    return (
      <ThemeProvider><NotificationProvider userId="demo-user"><AppShell activeApp="docs" notifications={<><ThemeToggle/><NotificationBell/></>}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-4">Sign in to access your documents</h2>
            <Button onClick={() => login()}>Sign in with SSO</Button>
          </div>
        </div>
      </AppShell></NotificationProvider></ThemeProvider>
    );
  }

  return (
    <>
    <ThemeProvider><NotificationProvider userId="demo-user"><AppShell activeApp="docs" notifications={<><ThemeToggle/><NotificationBell/></>}>>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Documents</h2>
          <div className="flex gap-3">
            <div className="w-72">
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => setShowTemplates(true)} variant="ghost">
              📋 Templates
            </Button>
            <Button onClick={() => createDocument()} disabled={isCreating}>
              {isCreating ? 'Creating...' : '+ New Document'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading documents...</div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {searchQuery ? 'No documents match your search.' : 'No documents yet.'}
            </p>
            {!searchQuery && (
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowTemplates(true)} variant="ghost">📋 Use a template</Button>
                <Button onClick={() => createDocument()}>Create your first document</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocs.map(doc => (
              <Card key={doc.id} onClick={() => window.location.href = `/editor/${doc.id}`}>
                <div className="flex items-center gap-4">
                  <span className="text-2xl">📝</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500">
                      Last edited {formatTime(doc.updatedAt)}
                      {doc.collaborators?.length > 0 &&
                        ` • ${doc.collaborators.length} collaborator${doc.collaborators.length > 1 ? 's' : ''}`}
                    </p>
                  </div>
                  {/* Collaborator avatars */}
                  {doc.collaborators?.length > 0 && (
                    <div className="flex -space-x-1">
                      {doc.collaborators.slice(0, 3).map((c, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-medium border border-white"
                          style={{backgroundColor: c.color}}
                          title={c.name}
                        >
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" size="sm">Open</Button>
                  <button
                    onClick={e => deleteDocument(doc.id, e)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell></NotificationProvider></ThemeProvider>

    {/* Template Picker Modal — rendered outside AppShell */}
    <TemplatePicker
      open={showTemplates}
      onClose={() => setShowTemplates(false)}
      onSelect={createFromTemplate}
    />
    </>
  );
}
