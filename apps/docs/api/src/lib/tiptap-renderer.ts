/**
 * Tiptap rendering utilities
 *
 * Provides server-side HTML rendering using @tiptap/static-renderer
 * for document previews and OG image generation.
 */

import { generateHTML } from '@tiptap/static-renderer';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { type JSONContent } from '@tiptap/core';

/**
 * Get the Tiptap extensions used for rendering.
 * Matches the editor configuration for consistent output.
 */
function getExtensions() {
  return [
    StarterKit,
    Highlight,
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Typography,
    Placeholder.configure({ placeholder: 'Start writing...' }),
  ];
}

/**
 * Render Tiptap JSON content to HTML using static renderer.
 * Falls back to raw HTML if input is already HTML.
 */
export function renderToHtml(content: string | JSONContent): string {
  try {
    // If content is already HTML (from templates or legacy data), sanitize and return
    if (typeof content === 'string') {
      if (content.startsWith('<')) {
        return sanitizeHtml(content);
      }
      // Try parsing as JSON
      try {
        const json = JSON.parse(content);
        return generateHTML(json, getExtensions());
      } catch {
        return sanitizeHtml(content);
      }
    }

    // JSONContent object
    return generateHTML(content, getExtensions());
  } catch {
    return typeof content === 'string' ? sanitizeHtml(content) : '';
  }
}

/**
 * Generate a truncated preview from HTML content.
 * Returns a short HTML snippet suitable for document listing cards.
 */
export function generatePreview(content: string | JSONContent, maxLength: number = 300): string {
  const html = renderToHtml(content);
  const text = stripTags(html);

  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

/**
 * Generate a rich HTML preview card for document listing.
 * Includes first heading and first paragraph.
 */
export function generateRichPreview(content: string | JSONContent): {
  heading: string | null;
  excerpt: string;
  wordCount: number;
} {
  const html = renderToHtml(content);
  const text = stripTags(html);

  // Extract first heading
  const headingMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const heading = headingMatch ? stripTags(headingMatch[1]) : null;

  // Extract first paragraph after heading
  const paragraphMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const excerpt = paragraphMatch
    ? stripTags(paragraphMatch[1]).slice(0, 200)
    : text.slice(0, 200);

  return {
    heading,
    excerpt: excerpt || 'Empty document',
    wordCount: countWords(html),
  };
}

/**
 * Sanitize HTML for safe rendering in previews.
 * Removes scripts, event handlers, and dangerous tags.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(?!\/?(h[1-6]|p|ul|ol|li|a|strong|em|b|i|u|s|code|pre|blockquote|br|hr|img|span|div|table|thead|tbody|tr|th|td|mark)\b)[^>]*>/gi, '');
}

/**
 * Strip all HTML tags from content.
 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Count words in HTML content.
 */
function countWords(html: string): number {
  const text = stripTags(html);
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract headings from HTML for table of contents generation.
 */
export function extractHeadings(html: string): Array<{ level: number; text: string; id?: string }> {
  const headings: Array<{ level: number; text: string; id?: string }> = [];
  const headingRegex = /<h([1-6])(?:\s+id="([^"]*)")?>([\s\S]*?)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const id = match[2] || undefined;
    const text = stripTags(match[3]);
    if (text.trim()) {
      headings.push({ level, text, id });
    }
  }

  return headings;
}

/**
 * Generate SVG-based OG image for document sharing.
 * Returns an SVG string that can be served as an image.
 */
export function generateOgImage(title: string, excerpt: string, author?: string): string {
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
  <rect width="1200" height="630" fill="url(#bg)" rx="0" />
  <rect x="60" y="60" width="1080" height="510" fill="white" rx="16" opacity="0.95" />
  <text x="100" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="#1a1a1a" max-lines="2">${safeTitle}</text>
  <text x="100" y="220" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="#666" max-lines="3">${safeExcerpt}</text>
  ${safeAuthor ? `<text x="100" y="520" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#999">By ${safeAuthor} · Anvil Docs</text>` : `<text x="100" y="520" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="#999">Anvil Docs</text>`}
  <rect x="60" y="585" width="1080" height="4" fill="#4285F4" rx="2" />
</svg>`;
}

/**
 * Convert HTML content to structured JSON for search indexing.
 */
export function htmlToJson(html: string): Array<{ type: string; content?: string; level?: number }> {
  const blocks: Array<{ type: string; content?: string; level?: number }> = [];
  const tagRegex = /<(h[1-6]|p|ul|ol|li|blockquote|pre|code)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = stripTags(match[2]);

    if (!text.trim()) continue;

    if (tag.match(/^h([1-6])$/)) {
      blocks.push({ type: 'heading', content: text, level: parseInt(tag[1]) });
    } else if (tag === 'p') {
      blocks.push({ type: 'paragraph', content: text });
    } else if (tag === 'li') {
      blocks.push({ type: 'listItem', content: text });
    } else if (tag === 'blockquote') {
      blocks.push({ type: 'blockquote', content: text });
    } else if (tag === 'pre' || tag === 'code') {
      blocks.push({ type: 'code', content: text });
    }
  }

  if (blocks.length === 0) {
    const text = stripTags(html).trim();
    if (text) blocks.push({ type: 'paragraph', content: text });
  }

  return blocks;
}

/**
 * Escape special XML characters for SVG generation.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
