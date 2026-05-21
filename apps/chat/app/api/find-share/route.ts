/**
 * POST /api/find-share — Searches Drive and creates a share link.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';
import { getToolExecutor } from '@/lib/tool-executor';

export async function POST(req: NextRequest) {
  const { query, recipient } = await req.json();

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const tools = getToolExecutor();

  // Search for the file
  const searchResults = await tools.searchFiles(query, 'any', 5);

  try {
    const files = JSON.parse(searchResults);
    if (!files.results?.length && !files.length) {
      return NextResponse.json({ found: false, message: 'No files found matching your query.' });
    }

    // Pick the best match
    const file = files.results?.[0] ?? files[0];

    // Create share link
    const shareResult = await tools.createShareLink(file.id);

    return NextResponse.json({
      found: true,
      file: { id: file.id, name: file.name ?? file.title, type: file.type },
      shareLink: JSON.parse(shareResult),
    });
  } catch {
    return NextResponse.json({ found: false, message: 'Error searching files.' });
  }
}
