'use client';

import {useState, useMemo} from 'react';

// ── API Endpoints ──

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  category: string;
  auth: boolean;
  params?: {name: string; type: string; required: boolean; description: string}[];
  body?: string; // JSON example
  responseExample: string;
}

const ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'GET', path: '/api/files', description: 'List files in a directory', category: 'Drive', auth: true,
    params: [{name: 'path', type: 'string', required: true, description: 'Directory path (e.g., "root/photos")'}],
    responseExample: JSON.stringify([{id: 'abc123', name: 'report.pdf', mimeType: 'application/pdf', size: 245760, path: 'root.reports'}], null, 2),
  },
  {
    method: 'POST', path: '/api/files/upload', description: 'Upload a file', category: 'Drive', auth: true,
    params: [{name: 'path', type: 'string', required: true, description: 'Target directory'}],
    responseExample: JSON.stringify({id: 'new123', name: 'photo.jpg', size: 1048576, url: '/api/files/new123/download'}, null, 2),
  },
  {
    method: 'GET', path: '/api/documents', description: 'List all documents', category: 'Docs', auth: true,
    responseExample: JSON.stringify([{id: 'doc1', title: 'Project Plan', content: '...', createdAt: '2026-05-20T10:00:00Z'}], null, 2),
  },
  {
    method: 'POST', path: '/api/documents', description: 'Create a new document', category: 'Docs', auth: true,
    body: JSON.stringify({title: 'My Document', content: '<p>Hello world</p>'}, null, 2),
    responseExample: JSON.stringify({id: 'doc_new', title: 'My Document', createdAt: '2026-05-20T10:00:00Z'}, null, 2),
  },
  {
    method: 'GET', path: '/api/documents/{id}', description: 'Get a document by ID', category: 'Docs', auth: true,
    params: [{name: 'id', type: 'uuid', required: true, description: 'Document ID'}],
    responseExample: JSON.stringify({id: 'doc1', title: 'Project Plan', content: '<p>...</p>', updatedAt: '2026-05-20T12:00:00Z'}, null, 2),
  },
  {
    method: 'POST', path: '/api/files/search/semantic', description: 'Semantic file search with embeddings', category: 'Search', auth: true,
    body: JSON.stringify({query: 'quarterly budget report', userId: 'user123', limit: 10}, null, 2),
    responseExample: JSON.stringify({results: [{id: 'f1', name: 'q1-budget.xlsx', similarity: 0.94}], searchType: 'vector'}, null, 2),
  },
  {
    method: 'GET', path: '/api/analytics/global', description: 'Get global collaboration analytics', category: 'Analytics', auth: true,
    responseExample: JSON.stringify({totalDocuments: 45, totalActiveUsers: 12, totalEdits: 1247}, null, 2),
  },
  {
    method: 'GET', path: '/api/templates', description: 'List available document templates', category: 'Docs', auth: true,
    responseExample: JSON.stringify([{id: 'meeting-notes', name: 'Meeting Notes', category: 'work'}, {id: 'project-proposal', name: 'Project Proposal', category: 'work'}], null, 2),
  },
  {
    method: 'GET', path: '/health', description: 'Service health check', category: 'System', auth: false,
    responseExample: JSON.stringify({status: 'ok', uptime: 86400, version: '0.1.0'}, null, 2),
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-yellow-100 text-yellow-700',
  PATCH: 'bg-orange-100 text-orange-700',
  DELETE: 'bg-red-100 text-red-700',
};

const API_BASE = 'https://api.anvil.dev';

export function ApiPlayground({open, onClose}: {open: boolean; onClose: () => void}) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const categories = useMemo(() => ['all', ...new Set(ENDPOINTS.map(e => e.category))], []);

  const filtered = useMemo(() => {
    return ENDPOINTS.filter(e => {
      const matchCategory = category === 'all' || e.category === category;
      const matchFilter = !filter || e.path.toLowerCase().includes(filter.toLowerCase()) || e.description.toLowerCase().includes(filter.toLowerCase());
      return matchCategory && matchFilter;
    });
  }, [filter, category]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔌</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">API Playground</h1>
            <p className="text-xs text-gray-500">Interactive API explorer for Anvil services</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">✕</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — endpoint list */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-3 space-y-2 border-b border-gray-100 dark:border-gray-800">
            <input
              placeholder="Filter endpoints..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-sm"
            />
            <div className="flex gap-1 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-2 py-1 rounded text-[10px] font-medium ${category === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800'}`}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {filtered.map((ep, i) => (
              <button
                key={i}
                onClick={() => { setSelectedEndpoint(ep); setResponse(null); }}
                className={`w-full text-left px-4 py-2.5 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  selectedEndpoint === ep ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
                  <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">{ep.path}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5 ml-12">{ep.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          {selectedEndpoint ? (
            <div className="max-w-3xl space-y-6">
              {/* Endpoint header */}
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold px-2 py-1 rounded ${METHOD_COLORS[selectedEndpoint.method]}`}>{selectedEndpoint.method}</span>
                <code className="text-sm font-mono text-gray-900 dark:text-gray-100">{API_BASE}{selectedEndpoint.path}</code>
                {selectedEndpoint.auth && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">🔒 Auth Required</span>}
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">{selectedEndpoint.description}</p>

              {/* Parameters */}
              {selectedEndpoint.params && selectedEndpoint.params.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Parameters</h3>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Name</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Required</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEndpoint.params.map(p => (
                          <tr key={p.name} className="border-b border-gray-100 dark:border-gray-700/50">
                            <td className="px-3 py-2 font-mono text-blue-600">{p.name}</td>
                            <td className="px-3 py-2 text-gray-500">{p.type}</td>
                            <td className="px-3 py-2">{p.required ? <span className="text-red-500">Yes</span> : 'No'}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Request body */}
              {selectedEndpoint.body && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Request Body</h3>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto font-mono">{selectedEndpoint.body}</pre>
                </div>
              )}

              {/* Response example */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Response Example</h3>
                <pre className="bg-gray-900 text-gray-300 p-4 rounded-lg text-xs overflow-auto font-mono">{selectedEndpoint.responseExample}</pre>
              </div>

              {/* Try it */}
              <div>
                <button
                  onClick={() => { setIsLoading(true); setTimeout(() => { setResponse(selectedEndpoint.responseExample); setIsLoading(false); }, 800); }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : '▶ Try It'}
                </button>
              </div>

              {response && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Response</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">200 OK</span>
                    <span className="text-[10px] text-gray-400">application/json</span>
                  </div>
                  <pre className="bg-gray-900 text-gray-300 p-4 rounded-lg text-xs overflow-auto font-mono">{response}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <span className="text-4xl">🔌</span>
                <p className="text-gray-500 mt-3">Select an endpoint to explore</p>
                <p className="text-xs text-gray-400 mt-1">{ENDPOINTS.length} endpoints available</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
