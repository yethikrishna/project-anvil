'use client';
import {useState} from 'react';
import {AppShell, Input, Button, Card} from '@anvil/ui';

const MOCK_RESULTS = [
  {id: '1', title: 'Next.js 15 Documentation', url: 'nextjs.org/docs', snippet: 'Learn how to build full-stack web applications with Next.js 15...'},
  {id: '2', title: 'Meilisearch: Typo-tolerant Search Engine', url: 'meilisearch.com', snippet: 'A powerful, fast, open-source search engine built in Rust...'},
  {id: '3', title: 'CRDTs for Collaborative Editing', url: 'crdt.tech', snippet: 'Conflict-free Replicated Data Types enable real-time collaboration...'},
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  return (
    <AppShell activeApp="search">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center mb-8 mt-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            <span className="text-blue-500">A</span><span className="text-red-500">n</span><span className="text-yellow-500">v</span><span className="text-blue-500">i</span><span className="text-green-500">l</span>
          </h1>
          <p className="text-gray-500">Hybrid BM25 + Semantic Search</p>
        </div>
        <div className="flex gap-2 mb-6">
          <Input placeholder="Search the web..." value={query} onChange={e => setQuery(e.target.value)} />
          <Button>Search</Button>
        </div>
        {query && (
          <div className="space-y-3">
            {MOCK_RESULTS.map(r => (
              <Card key={r.id}>
                <p className="text-xs text-green-700 mb-1">{r.url}</p>
                <h3 className="text-blue-700 text-sm font-medium hover:underline cursor-pointer">{r.title}</h3>
                <p className="text-xs text-gray-600 mt-1">{r.snippet}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
