/**
 * POST /api/find-share — Searches Drive and creates a share link.
 *
 * Flow:
 * 1. Search Drive for matching files
 * 2. Pick best match
 * 3. Create public share link
 * 4. Return file info + link
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToolExecutor } from '@/lib/tool-executor';

export async function POST(req: NextRequest) {
  const { query, recipient, userId } = await req.json();

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const tools = getToolExecutor({ userId });

  // Search for the file
  const searchResults = await tools.searchFiles(query, 'any', 5);

  try {
    const data = JSON.parse(searchResults);
    const files = data.results ?? data ?? [];

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({
        found: false,
        message: `No files found matching "${query}".`,
        suggestions: [
          'Try a different search term',
          'Check if the file is in a shared folder',
          'The file might not be indexed yet',
        ],
      });
    }

    // Pick the best match (first result)
    const file = files[0];

    // Create share link
    const shareResult = await tools.createShareLink(file.id ?? file.fileId);
    let shareData;
    try {
      shareData = JSON.parse(shareResult);
    } catch {
      shareData = { url: shareResult };
    }

    const result: Record<string, unknown> = {
      found: true,
      file: {
        id: file.id ?? file.fileId,
        name: file.name ?? file.title ?? file.filename ?? 'Unknown',
        type: file.type ?? file.mimeType ?? 'unknown',
        size: file.size,
        modified: file.modified ?? file.updatedAt,
      },
      shareLink: shareData.url ?? shareData.link ?? '',
      shareData,
    };

    // If recipient specified, offer to email
    if (recipient) {
      result.emailDraft = {
        to: recipient,
        subject: `Shared: ${result.file.name}`,
        body: `Hi,\n\nI've shared a file with you: ${result.file.name}\n\nAccess it here: ${result.shareLink}\n\nBest,\nAnvil AI`,
      };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      found: false,
      message: 'Error processing search results.',
    });
  }
}
