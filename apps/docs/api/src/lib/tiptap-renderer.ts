/**
 * Tiptap rendering utilities
 *
 * Provides server-side HTML-to-JSON and JSON-to-HTML conversion
 * using Tiptap's static rendering capabilities.
 */

/**
 * Convert HTML content to a structured JSON representation
 * for search indexing and preview generation.
 */
export function htmlToJson(html: string): Array<{ type: string; content?: string; level?: number }> {
  const blocks: Array<{ type: string; content?: string; level?: number }> = [];

  // Simple HTML parser for structured extraction
  // For production, use a proper HTML parser like linkedom or jsdom
  const tagRegex = /<(h[1-6]|p|ul|ol|li|blockquote|pre|code)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const text = stripTags(match[2]);

    if (!text.trim()) continue;

    if (tag.match(/^h([1-6])$/)) {
      const level = parseInt(tag[1]);
      blocks.push({ type: 'heading', content: text, level });
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

  // If no blocks found, return the whole content as one paragraph
  if (blocks.length === 0) {
    const text = stripTags(html).trim();
    if (text) {
      blocks.push({ type: 'paragraph', content: text });
    }
  }

  return blocks;
}

/**
 * Convert structured content back to clean HTML.
 * Strips potentially dangerous tags/attributes for safe preview rendering.
 */
export function jsonToHtml(html: string): string {
  // Sanitize HTML for safe rendering in previews
  return html
    // Remove script tags entirely
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Remove event handlers
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove style tags that could be dangerous
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Keep only safe tags
    .replace(/<(?!\/?(h[1-6]|p|ul|ol|li|a|strong|em|b|i|u|s|code|pre|blockquote|br|hr|img|span|div|table|thead|tbody|tr|th|td)\b)[^>]*>/gi, '');
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
 * Generate a document excerpt for search indexing and previews.
 */
export function generateExcerpt(html: string, maxLength: number = 200): string {
  const text = stripTags(html);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

/**
 * Count words in HTML content.
 */
export function countWords(html: string): number {
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
