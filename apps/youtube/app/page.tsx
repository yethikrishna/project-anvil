'use client';
import {AppShell, Card, Input} from '@anvil/ui';

const MOCK_VIDEOS = [
  {id: '1', title: 'Building a Full-Stack App with Next.js 15', channel: 'DevMaster', views: '1.2M', duration: '24:30', thumb: '🎬'},
  {id: '2', title: 'CRDTs Explained: How Google Docs Works', channel: 'TechDeep', views: '890K', duration: '18:45', thumb: '🎬'},
  {id: '3', title: 'Rust for TypeScript Developers', channel: 'CodeCraft', views: '456K', duration: '32:10', thumb: '🎬'},
  {id: '4', title: 'System Design: Map Rendering at Scale', channel: 'ArchScale', views: '234K', duration: '45:00', thumb: '🎬'},
  {id: '5', title: 'WebGL Shaders from Scratch', channel: 'GPUDev', views: '178K', duration: '28:15', thumb: '🎬'},
  {id: '6', title: 'Building a Search Engine with Meilisearch', channel: 'SearchNerd', views: '345K', duration: '21:30', thumb: '🎬'},
];

export default function YouTubePage() {
  return (
    <AppShell activeApp="youtube">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Videos</h2>
          <div className="w-96">
            <Input placeholder="Search videos..." />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_VIDEOS.map(v => (
            <Card key={v.id} onClick={() => {}}>
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-4xl mb-3">{v.thumb}</div>
              <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{v.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{v.channel} • {v.views} views • {v.duration}</p>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
