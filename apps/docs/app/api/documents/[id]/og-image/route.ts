/**
 * OG Image generation route for document share links.
 * Returns an SVG image with document title and excerpt.
 */

import { NextRequest, NextResponse } from 'next/server';

const DOCS_API = process.env.DOCS_API_URL ?? 'http://localhost:3102';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const resp = await fetch(`${DOCS_API}/api/documents/${id}`);
    if (!resp.ok) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const doc = await resp.json();
    const title = doc.title || 'Untitled Document';
    const excerpt = doc.preview || doc.content?.slice(0, 120) || 'Anvil Docs';

    const svg = generateOgImage(title, excerpt, doc.ownerId);

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch {
    return new NextResponse('Error generating image', { status: 500 });
  }
}

function generateOgImage(title: string, excerpt: string, author?: string): string {
  const safeTitle = escapeXml(title.slice(0, 60));
  const safeExcerpt = escapeXml(excerpt.slice(0, 120));
  const safeAuthor = author ? escapeXml(author) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a5f;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4285F4;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="60" y="60" width="1080" height="510" fill="white" rx="16" opacity="0.95" />
  <text x="100" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="#1a1a1a">${safeTitle}</text>
  <text x="100" y="220" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="#666">${safeExcerpt}</text>
  ${safeAuthor ? `<text x="100" y="520" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#999">By ${safeAuthor} · Anvil Docs</text>` : `<text x="100" y="520" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#999">Anvil Docs</text>`}
  <rect x="60" y="585" width="1080" height="4" fill="#4285F4" rx="2" />
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
