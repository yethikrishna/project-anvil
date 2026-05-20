/**
 * Docs API — Export routes (PDF / DOCX)
 *
 * Converts stored document HTML content into downloadable files.
 * - PDF  → pdfkit (lightweight, no headless browser needed)
 * - DOCX → docx   (full Office Open XML generation)
 */

import {FastifyInstance} from 'fastify';
import PDFDocument from 'pdfkit';
import {htmlToText} from 'html-to-text';
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  ExternalHyperlink,
  Bold,
  Italic,
  Underline as DocxUnderline,
  Strike,
} from 'docx';
import {db} from '../db/index.js';
import {documents} from '../db/schema.js';
import {eq} from 'drizzle-orm';

// ── Helpers: Parse HTML into structured nodes ──

interface DocNode {
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote' | 'code' | 'hr';
  level?: number;
  content?: string;
  ordered?: boolean;
  children?: DocNode[];
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
}

/**
 * Minimal HTML → structured node parser.
 * Handles: h1-h6, p, ul/ol/li, blockquote, pre/code, hr, strong/b, em/i, u, s/del, a[href], br
 */
function parseHTML(html: string): DocNode[] {
  const nodes: DocNode[] = [];

  // Split by block-level elements
  const blockRegex = /<(h[1-6]|p|blockquote|pre|ul|ol|li|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  const listContainerRegex = /<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  // First pass: extract list containers, then other blocks
  let remaining = html;

  // Process lists first (they contain li items)
  const listMatches: {start: number; end: number; node: DocNode}[] = [];

  let match: RegExpExecArray | null;
  listContainerRegex.lastIndex = 0;
  while ((match = listContainerRegex.exec(remaining)) !== null) {
    const ordered = match[1] === 'ol';
    const inner = match[2];
    const items: DocNode[] = [];

    const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRegex.exec(inner)) !== null) {
      items.push({
        type: 'list-item',
        ordered,
        content: stripInlineTags(liMatch[1]),
      });
    }

    listMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      node: {type: 'paragraph', children: items} as any,
    });
  }

  // Build a clean version without lists, then parse blocks
  let cleanHTML = remaining;
  // Remove list containers and insert markers
  for (let i = listMatches.length - 1; i >= 0; i--) {
    const lm = listMatches[i];
    cleanHTML =
      cleanHTML.slice(0, lm.start) +
      `<!--LIST:${i}-->` +
      cleanHTML.slice(lm.end);
  }

  // Split into blocks
  const parts = cleanHTML.split(/(<\/?(?:h[1-6]|p|blockquote|pre|hr|br)\b[^>]*>)/i);
  let currentTag = '';
  let currentContent = '';

  const flush = () => {
    const text = currentContent.trim();
    if (!text && currentTag !== 'hr') {
      currentTag = '';
      currentContent = '';
      return;
    }

    if (currentTag === 'hr') {
      nodes.push({type: 'hr'});
    } else if (/^h([1-6])$/i.test(currentTag)) {
      const level = parseInt(RegExp.$1);
      nodes.push({type: 'heading', level, content: stripInlineTags(text)});
    } else if (currentTag === 'blockquote') {
      nodes.push({type: 'blockquote', content: stripInlineTags(text)});
    } else if (currentTag === 'pre') {
      nodes.push({type: 'code', content: text});
    } else {
      // Check for list marker
      const listMatch = text.match(/^<!--LIST:(\d+)-->$/);
      if (listMatch) {
        const idx = parseInt(listMatch[1]);
        nodes.push(...listMatches[idx].node.children!);
      } else {
        nodes.push({type: 'paragraph', content: stripInlineTags(text)});
      }
    }

    currentTag = '';
    currentContent = '';
  };

  for (const part of parts) {
    if (/^<\/?(h[1-6]|p|blockquote|pre|hr)\b[^>]*>$/i.test(part)) {
      if (/^<(h[1-6]|p|blockquote|pre)\b/i.test(part)) {
        flush();
        currentTag = part.replace(/[<\/>]/g, '').split(' ')[0].toLowerCase();
      } else if (/^<hr/i.test(part)) {
        flush();
        currentTag = 'hr';
        flush();
      } else {
        flush();
      }
    } else if (part === '<br>' || part === '<br/>') {
      currentContent += '\n';
    } else {
      // Check for list markers
      const listMarker = part.match(/<!--LIST:(\d+)-->/);
      if (listMarker) {
        flush();
        const idx = parseInt(listMarker[1]);
        nodes.push(...listMatches[idx].node.children!);
      } else {
        currentContent += part;
      }
    }
  }
  flush();

  // If no block elements found, treat entire HTML as one paragraph
  if (nodes.length === 0 && html.trim()) {
    nodes.push({type: 'paragraph', content: stripInlineTags(html)});
  }

  return nodes;
}

/**
 * Strip inline HTML tags but preserve text content.
 * For more complex inline formatting, use html-to-text as fallback.
 */
function stripInlineTags(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      {selector: 'a', options: {hideLinkHrefIfSameAsText: true}},
      {selector: 'img', format: 'skip'},
    ],
  }).trim();
}

// ── PDF Generation ──

async function generatePDF(title: string, htmlContent: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: {top: 72, bottom: 72, left: 72, right: 72},
      info: {
        Title: title,
        Creator: 'Project Anvil — Docs',
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text(title, {align: 'left'});
    doc.moveDown(1);

    // Draw a thin line
    doc
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .moveTo(72, doc.y)
      .lineTo(doc.page.width - 72, doc.y)
      .stroke();
    doc.moveDown(0.5);

    // Parse and render content
    const nodes = parseHTML(htmlContent);

    for (const node of nodes) {
      // Check if we need a new page
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      switch (node.type) {
        case 'heading': {
          const sizes: Record<number, number> = {1: 20, 2: 17, 3: 14, 4: 13, 5: 12, 6: 11};
          const size = sizes[node.level ?? 1] ?? 14;
          doc.fontSize(size).font('Helvetica-Bold').text(node.content ?? '', {align: 'left'});
          doc.moveDown(0.3);
          break;
        }
        case 'paragraph': {
          doc.fontSize(11).font('Helvetica').text(node.content ?? '', {
            align: 'left',
            lineGap: 3,
          });
          doc.moveDown(0.4);
          break;
        }
        case 'list-item': {
          const bullet = node.ordered ? '•' : '•';
          doc.fontSize(11).font('Helvetica').text(`  ${bullet}  ${node.content ?? ''}`, {
            align: 'left',
            lineGap: 2,
            indent: 20,
          });
          doc.moveDown(0.15);
          break;
        }
        case 'blockquote': {
          const x = doc.x;
          doc
            .strokeColor('#3b82f6')
            .lineWidth(3)
            .moveTo(80, doc.y)
            .lineTo(80, doc.y + 40)
            .stroke();
          doc.fontSize(11).font('Helvetica-Oblique').text(node.content ?? '', 90, undefined, {
            align: 'left',
            lineGap: 2,
          });
          doc.moveDown(0.4);
          break;
        }
        case 'code': {
          doc.rect(72, doc.y - 2, doc.page.width - 144, 20).fill('#f3f4f6');
          doc.fontSize(10).font('Courier').fillColor('#374151').text(node.content ?? '', 80);
          doc.fillColor('#000000');
          doc.moveDown(0.4);
          break;
        }
        case 'hr': {
          doc
            .strokeColor('#e5e7eb')
            .lineWidth(0.5)
            .moveTo(72, doc.y)
            .lineTo(doc.page.width - 72, doc.y)
            .stroke();
          doc.moveDown(0.5);
          break;
        }
      }
    }

    // Footer
    doc.end();
  });
}

// ── DOCX Generation ──

async function generateDOCX(title: string, htmlContent: string): Promise<Buffer> {
  const nodes = parseHTML(htmlContent);

  const children: (Paragraph | typeof children[number])[] = [];

  // Title paragraph
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 48, // 24pt
          font: 'Calibri',
        }),
      ],
      spacing: {after: 200},
    })
  );

  for (const node of nodes) {
    switch (node.type) {
      case 'heading': {
        const headingMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6,
        };
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: node.content ?? '',
                bold: true,
                font: 'Calibri',
              }),
            ],
            heading: headingMap[node.level ?? 1] ?? HeadingLevel.HEADING_1,
            spacing: {before: 240, after: 120},
          })
        );
        break;
      }
      case 'paragraph': {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: node.content ?? '',
                font: 'Calibri',
                size: 22, // 11pt
              }),
            ],
            spacing: {after: 160},
          })
        );
        break;
      }
      case 'list-item': {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `• ${node.content ?? ''}`,
                font: 'Calibri',
                size: 22,
              }),
            ],
            bullet: {level: 0},
            spacing: {after: 80},
          })
        );
        break;
      }
      case 'blockquote': {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: node.content ?? '',
                italics: true,
                font: 'Calibri',
                size: 22,
                color: '4B5563',
              }),
            ],
            indent: {left: 720}, // 0.5 inch
            spacing: {after: 160},
            border: {
              left: {style: 'single', size: 6, color: '3B82F6', space: 10},
            },
          })
        );
        break;
      }
      case 'code': {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: node.content ?? '',
                font: 'Courier New',
                size: 20,
                color: '374151',
              }),
            ],
            shading: {fill: 'F3F4F6'},
            spacing: {after: 160},
          })
        );
        break;
      }
      case 'hr': {
        children.push(
          new Paragraph({
            children: [],
            spacing: {before: 120, after: 120},
            border: {
              bottom: {style: 'single', size: 1, color: 'D1D5DB', space: 1},
            },
          })
        );
        break;
      }
    }
  }

  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1 inch in twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as Promise<Buffer>;
}

// ── Routes ──

export async function exportRoutes(app: FastifyInstance) {
  // Export document as PDF
  app.get<{Params: {id: string}}>('/api/documents/:id/export/pdf', async (request, reply) => {
    const {id} = request.params;

    const rows = await db
      .select({title: documents.title, content: documents.content})
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!rows.length) {
      return reply.code(404).send({error: 'Document not found'});
    }

    const {title, content} = rows[0];
    const htmlContent = content ?? '';

    const pdfBuffer = await generatePDF(title, htmlContent);

    const safeTitle = (title ?? 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`)
      .header('Content-Length', pdfBuffer.length)
      .send(pdfBuffer);
  });

  // Export document as DOCX
  app.get<{Params: {id: string}}>('/api/documents/:id/export/docx', async (request, reply) => {
    const {id} = request.params;

    const rows = await db
      .select({title: documents.title, content: documents.content})
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!rows.length) {
      return reply.code(404).send({error: 'Document not found'});
    }

    const {title, content} = rows[0];
    const htmlContent = content ?? '';

    const docxBuffer = await generateDOCX(title, htmlContent);

    const safeTitle = (title ?? 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
    reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      .header('Content-Disposition', `attachment; filename="${safeTitle}.docx"`)
      .header('Content-Length', docxBuffer.length)
      .send(docxBuffer);
  });
}
