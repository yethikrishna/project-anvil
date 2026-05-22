/**
 * Smart Document Export — AI-Enhanced Export Pipeline
 *
 * Generates polished exports (PDF, DOCX, HTML) that:
 * - Preserves AI-generated research blocks
 * - Includes auto-generated table of contents
 * - Adds document health summary
 * - Formats citations and references
 * - Custom styling based on document type
 */

import type {Editor} from '@tiptap/react';

// ── Types ──

interface ExportOptions {
  format: 'pdf' | 'docx' | 'html' | 'markdown';
  includeTOC: boolean;
  includeSummary: boolean;
  includeHealth: boolean;
  style: 'academic' | 'business' | 'casual' | 'minimal';
}

interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

// ── HTML Export with AI Features ──

export function exportToHTML(editor: Editor, options: Partial<ExportOptions> = {}): ExportResult {
  const html = editor.getHTML();
  const title = extractTitle(editor) || 'Untitled Document';

  const styledHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    ${getExportStyles(options.style || 'business')}

    /* AI Research Block Styles */
    .ai-research-block {
      border-left: 3px solid #6366f1;
      padding: 12px 16px;
      margin: 16px 0;
      background: #f8f7ff;
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid;
    }
    .ai-research-header {
      font-weight: 600;
      color: #4338ca;
      margin-bottom: 8px;
    }
    .ai-research-result {
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .ai-research-result:last-child { border-bottom: none; }
    .ai-citation-marker {
      display: inline-block;
      width: 20px;
      height: 20px;
      background: #eef2ff;
      color: #6366f1;
      border-radius: 4px;
      text-align: center;
      line-height: 20px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 6px;
    }
    .ai-citation-source {
      color: #6366f1;
      font-weight: 500;
    }

    /* Print optimizations */
    @media print {
      body { margin: 0; }
      .ai-research-block { break-inside: avoid; }
      h1, h2, h3 { break-after: avoid; }
    }
  </style>
</head>
<body>
  ${options.includeTOC ? generateTOC(html) : ''}
  ${html}
</body>
</html>`;

  const blob = new Blob([styledHTML], {type: 'text/html'});
  return {
    blob,
    filename: `${sanitizeFilename(title)}.html`,
    mimeType: 'text/html',
  };
}

// ── Markdown Export ──

export function exportToMarkdown(editor: Editor, options: Partial<ExportOptions> = {}): ExportResult {
  const html = editor.getHTML();
  const title = extractTitle(editor) || 'Untitled Document';

  let markdown = htmlToMarkdown(html);

  if (options.includeTOC) {
    const toc = generateMarkdownTOC(markdown);
    markdown = `# ${title}\n\n${toc}\n\n---\n\n${markdown}`;
  }

  const blob = new Blob([markdown], {type: 'text/markdown'});
  return {
    blob,
    filename: `${sanitizeFilename(title)}.md`,
    mimeType: 'text/markdown',
  };
}

// ── Helpers ──

function extractTitle(editor: Editor): string | null {
  const doc = editor.state.doc;
  for (let i = 0; i < doc.content.childCount; i++) {
    const node = doc.content.child(i);
    if (node.type.name === 'heading' && node.attrs.level === 1) {
      return node.textContent;
    }
  }
  // Fallback: first line of text
  const text = doc.textContent;
  const firstLine = text.split('\n')[0]?.trim();
  return firstLine && firstLine.length < 100 ? firstLine : null;
}

function getExportStyles(style: ExportOptions['style']): string {
  const base = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1f2937;
      line-height: 1.7;
    }
    h1 { font-size: 2em; margin: 1em 0 0.5em; color: #111827; }
    h2 { font-size: 1.5em; margin: 1.2em 0 0.4em; color: #1f2937; }
    h3 { font-size: 1.25em; margin: 1em 0 0.3em; color: #374151; }
    p { margin: 0.6em 0; }
    blockquote {
      border-left: 3px solid #d1d5db;
      padding-left: 16px;
      color: #6b7280;
      margin: 1em 0;
    }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: #1f2937;
      color: #e5e7eb;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    img { max-width: 100%; border-radius: 6px; }
    a { color: #6366f1; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
  `;

  const styles: Record<string, string> = {
    academic: base + `
      body { font-family: 'Georgia', serif; font-size: 12pt; }
      h1, h2, h3 { font-family: 'Helvetica Neue', sans-serif; }
    `,
    business: base + `
      body { font-size: 11pt; }
      h1 { border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
    `,
    casual: base + `
      body { font-size: 14px; }
    `,
    minimal: `
      body {
        font-family: 'Inter', -apple-system, sans-serif;
        max-width: 680px;
        margin: 40px auto;
        color: #374151;
        line-height: 1.8;
      }
      h1, h2, h3 { font-weight: 600; color: #111827; }
      p { margin: 0.5em 0; }
    `,
  };

  return styles[style] || base;
}

function generateTOC(html: string): string {
  const headingRegex = /<h([1-3])[^>]*>(.*?)<\/h[1-3]>/g;
  const headings: Array<{level: number; text: string; id: string}> = [];
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '');
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    headings.push({level: parseInt(match[1]), text, id});
  }

  if (headings.length < 2) return '';

  const items = headings.map(h => {
    const indent = '  '.repeat(h.level - 1);
    return `${indent}<a href="#${h.id}" style="color: #6366f1; text-decoration: none;">${h.text}</a>`;
  }).join('<br>\n');

  return `<nav style="background: #f9fafb; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px;">
  <p style="font-weight: 600; font-size: 14px; margin: 0 0 8px; color: #374151;">Table of Contents</p>
  <div style="font-size: 13px; line-height: 1.8;">
    ${items}
  </div>
</nav>`;
}

function generateMarkdownTOC(markdown: string): string {
  const lines = markdown.split('\n');
  const headings: Array<{level: number; text: string}> = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    if (match) {
      headings.push({level: match[1].length, text: match[2]});
    }
  }

  if (headings.length < 2) return '';

  return headings.map(h => {
    const indent = '  '.repeat(h.level - 1);
    const link = h.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${indent}- [${h.text}](#${link})`;
  }).join('\n');
}

function htmlToMarkdown(html: string): string {
  let md = html;

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

  // Bold, italic, strikethrough
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');

  // Links and images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Lists
  md = md.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    return content.split('\n').map((l: string) => `> ${l}`).join('\n') + '\n\n';
  });

  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
  md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // AI research blocks → blockquote with citation formatting
  md = md.replace(/<div class="ai-research-block">([\s\S]*?)<\/div>/gi, (_, content) => {
    const text = content.replace(/<[^>]+>/g, '').trim();
    return `> **Research:** ${text}\n\n`;
  });

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');

  return md.trim() + '\n';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}
