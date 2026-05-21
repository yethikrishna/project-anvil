'use client';

/**
 * AI Document Export Enhancer
 *
 * Smart export with:
 * - Format-aware formatting (PDF, DOCX, HTML, Markdown)
 * - Table of contents generation
 * - Header/footer injection
 * - Style presets (academic, business, newsletter)
 * - Image optimization for export
 * - Metadata injection (title, author, date)
 */

import type {Editor} from '@tiptap/react';

// ── Types ──

export type ExportFormat = 'pdf' | 'docx' | 'html' | 'markdown' | 'txt' | 'epub' | 'rtf';
export type ExportStyle = 'academic' | 'business' | 'newsletter' | 'minimal' | 'custom';

export interface ExportOptions {
  format: ExportFormat;
  style: ExportStyle;
  includeTOC: boolean;
  includeHeader: boolean;
  includeFooter: boolean;
  includePageNumbers: boolean;
  title?: string;
  author?: string;
  date?: string;
  headerText?: string;
  footerText?: string;
  fontSize?: number;
  fontFamily?: string;
  margins?: {top: number; right: number; bottom: number; left: number};
}

export const EXPORT_FORMATS: Array<{id: ExportFormat; label: string; icon: string; description: string}> = [
  {id: 'pdf', label: 'PDF', icon: '📄', description: 'Portable Document Format — best for sharing'},
  {id: 'docx', label: 'Word (DOCX)', icon: '📝', description: 'Microsoft Word format — editable'},
  {id: 'html', label: 'HTML', icon: '🌐', description: 'Web format — view in browser'},
  {id: 'markdown', label: 'Markdown', icon: '📋', description: 'Plain text markup — developer friendly'},
  {id: 'txt', label: 'Plain Text', icon: '📃', description: 'Simple text — universal compatibility'},
  {id: 'epub', label: 'EPUB', icon: '📚', description: 'E-book format — for readers'},
  {id: 'rtf', label: 'RTF', icon: '📃', description: 'Rich Text Format — legacy compatibility'},
];

export const EXPORT_STYLES: Array<{id: ExportStyle; label: string; description: string}> = [
  {id: 'academic', label: 'Academic', description: 'APA-style formatting with citations support'},
  {id: 'business', label: 'Business', description: 'Professional formatting with header/footer'},
  {id: 'newsletter', label: 'Newsletter', description: 'Email-ready formatting with inline styles'},
  {id: 'minimal', label: 'Minimal', description: 'Clean, no-frills formatting'},
  {id: 'custom', label: 'Custom', description: 'Your own custom styling'},
];

// ── HTML to Markdown Converter ──

function htmlToMarkdown(html: string): string {
  let md = html;

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Bold and italic
  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*');

  // Lists
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Images
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, content) => {
    return content.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n\n';
  });

  // Horizontal rules
  md = md.replace(/<hr[^>]*\/?>/gi, '---\n\n');

  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Tables (basic)
  md = md.replace(/<table[^>]*>(.*?)<\/table>/gis, (match, content) => {
    const rows = content.match(/<tr[^>]*>(.*?)<\/tr>/gis) || [];
    let tableMd = '';
    rows.forEach((row: string, i: number) => {
      const cells = (row.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/gi) || [])
        .map((c: string) => c.replace(/<\/?t[hd][^>]*>/gi, '').trim());
      tableMd += `| ${cells.join(' | ')} |\n`;
      if (i === 0) {
        tableMd += `| ${cells.map(() => '---').join(' | ')} |\n`;
      }
    });
    return tableMd + '\n';
  });

  // Line breaks
  md = md.replace(/<br[^>]*\/?>/gi, '\n');

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

// ── HTML to Plain Text ──

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br[^>]*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── TOC Generator ──

function generateTOC(html: string): string {
  const headings = [...html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi)];
  if (headings.length === 0) return '';

  let toc = '<div class="toc">\n<h2>Table of Contents</h2>\n<ul>\n';
  for (const match of headings) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, '');
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const indent = '  '.repeat(level - 1);
    toc += `${indent}<li><a href="#${id}">${text}</a></li>\n`;
  }
  toc += '</ul>\n</div>\n\n';
  return toc;
}

// ── Style Templates ──

function applyExportStyle(html: string, style: ExportStyle, options: ExportOptions): string {
  const styleTemplates: Record<string, string> = {
    academic: `<html>
<head>
<meta charset="utf-8">
<title>${options.title || 'Document'}</title>
<style>
  body { font-family: 'Times New Roman', Georgia, serif; font-size: ${options.fontSize || 12}pt; max-width: 8.5in; margin: 1in; line-height: 2; color: #000; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 24pt; }
  h2 { font-size: 14pt; margin-top: 18pt; }
  h3 { font-size: 12pt; margin-top: 14pt; }
  p { text-indent: 0.5in; margin-bottom: 12pt; }
  .toc { margin-bottom: 24pt; }
  .toc ul { list-style: none; padding-left: 1em; }
  .toc a { text-decoration: none; color: #000; }
  blockquote { margin-left: 0.5in; font-style: italic; }
</style>
</head>
<body>
${options.includeHeader ? `<div style="text-align:center;font-size:10pt;color:#666;margin-bottom:24pt">${options.headerText || ''}</div>` : ''}
${options.includeTOC ? generateTOC(html) : ''}
${html}
${options.includeFooter ? `<div style="text-align:center;font-size:10pt;color:#666;margin-top:24pt">${options.footerText || ''}</div>` : ''}
</body></html>`,

    business: `<html>
<head>
<meta charset="utf-8">
<title>${options.title || 'Document'}</title>
<style>
  body { font-family: 'Calibri', 'Helvetica Neue', Arial, sans-serif; font-size: ${options.fontSize || 11}pt; max-width: 7.5in; margin: 0.75in; line-height: 1.6; color: #333; }
  h1 { font-size: 20pt; color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 6pt; }
  h2 { font-size: 14pt; color: #2c5282; margin-top: 18pt; }
  h3 { font-size: 12pt; color: #2b6cb0; }
  p { margin-bottom: 10pt; }
  ul, ol { margin-left: 0.25in; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f7fafc; }
</style>
</head>
<body>
${options.includeHeader ? `<div style="margin-bottom:18pt;font-size:9pt;color:#999">${options.headerText || `${options.title || ''} | ${options.author || ''} | ${options.date || new Date().toLocaleDateString()}`}</div>` : ''}
${options.includeTOC ? generateTOC(html) : ''}
${html}
${options.includeFooter ? `<div style="margin-top:18pt;font-size:9pt;color:#999;border-top:1px solid #ddd;padding-top:6pt">${options.footerText || `Page 1 | Confidential`}</div>` : ''}
</body></html>`,

    newsletter: `<html>
<head>
<meta charset="utf-8">
<title>${options.title || 'Newsletter'}</title>
<style>
  body { font-family: 'Georgia', serif; font-size: ${options.fontSize || 14}px; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.8; color: #333; background: #fff; }
  h1 { font-size: 24px; color: #2d3748; margin-bottom: 4px; }
  h2 { font-size: 20px; color: #4a5568; margin-top: 24px; }
  p { margin-bottom: 16px; }
  a { color: #3182ce; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${html}
</body></html>`,

    minimal: `<html>
<head>
<meta charset="utf-8">
<title>${options.title || 'Document'}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; font-size: ${options.fontSize || 14}px; max-width: 680px; margin: 40px auto; line-height: 1.7; color: #1a1a1a; }
  h1, h2, h3 { line-height: 1.3; }
  p { margin-bottom: 1em; }
  img { max-width: 100%; }
</style>
</head>
<body>
${options.includeTOC ? generateTOC(html) : ''}
${html}
</body></html>`,

    custom: html,
  };

  return styleTemplates[style] || styleTemplates.minimal;
}

// ── Export Function ──

export function exportDocument(
  editor: Editor | null,
  options: ExportOptions
): {content: string; filename: string; mimeType: string} | null {
  if (!editor) return null;

  const html = editor.getHTML();
  const title = options.title || 'document';
  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  switch (options.format) {
    case 'html': {
      const styled = applyExportStyle(html, options.style, options);
      return {content: styled, filename: `${safeName}.html`, mimeType: 'text/html'};
    }

    case 'markdown': {
      const md = htmlToMarkdown(html);
      return {content: md, filename: `${safeName}.md`, mimeType: 'text/markdown'};
    }

    case 'txt': {
      const text = htmlToPlainText(html);
      return {content: text, filename: `${safeName}.txt`, mimeType: 'text/plain'};
    }

    case 'pdf':
    case 'docx':
    case 'epub':
    case 'rtf': {
      // For these formats, return styled HTML and let the server convert
      const styled = applyExportStyle(html, options.style, options);
      return {content: styled, filename: `${safeName}.${options.format}`, mimeType: 'text/html'};
    }

    default:
      return null;
  }
}

// ── Download Helper ──

export function downloadExport(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
