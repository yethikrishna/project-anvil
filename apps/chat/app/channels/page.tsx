'use client';

import ChannelsView from '@/components/ChannelsView';

export default function ChannelsPage() {
  return (
    <div className="h-screen">
      <ChannelsView userId="default" className="h-full" />
    </div>
  );
}
