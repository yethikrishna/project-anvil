'use client';
import {AppShell, Input} from '@anvil/ui';

export default function MapsPage() {
  return (
    <AppShell activeApp="maps">
      <div className="relative h-full">
        <div className="absolute top-4 left-4 z-10 w-80">
          <Input placeholder="Search places..." />
        </div>
        <div className="w-full h-full bg-gradient-to-br from-blue-100 via-green-100 to-blue-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-6xl mb-4">🗺️</p>
            <h3 className="text-lg font-medium text-gray-700">MapLibre GL JS</h3>
            <p className="text-sm text-gray-500 mt-1">WebGL vector tile rendering</p>
            <p className="text-xs text-gray-400 mt-2">Connect MapTiler/OpenMapTiles key to enable</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
