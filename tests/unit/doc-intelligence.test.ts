/**
 * Unit tests for document intelligence — auto TOC, style analysis, diff summary
 */

import {describe, it, expect} from 'vitest';
import {generateTOC, tocToMarkdown, analyzeStyle, summarizeDiff} from '../../packages/ai/src/tools/doc-intelligence.ts';

describe('generateTOC', () => {
  it('extracts headings from HTML', () => {
    const html = `
      <h1>Introduction</h1>
      <p>Some content</p>
      <h2>Getting Started</h2>
      <p>More content</p>
      <h2>API Reference</h2>
      <h3>Authentication</h3>
    `;

    const toc = generateTOC(html);
    expect(toc).toHaveLength(1); // One h1
    expect(toc[0].text).toBe('Introduction');
    expect(toc[0].children).toHaveLength(2); // Two h2s
    expect(toc[0].children[0].text).toBe('Getting Started');
    expect(toc[0].children[1].text).toBe('API Reference');
    expect(toc[0].children[1].children[0].text).toBe('Authentication');
  });

  it('returns empty array for content without headings', () => {
    expect(generateTOC('<p>Just a paragraph</p>')).toHaveLength(0);
  });

  it('generates slug IDs', () => {
    const toc = generateTOC('<h2>Hello World!</h2>');
    expect(toc[0].id).toBe('hello-world');
  });
});

describe('tocToMarkdown', () => {
  it('formats TOC as markdown links', () => {
    const toc = generateTOC('<h1>Title</h1><h2>Section 1</h2><h2>Section 2</h2>');
    const md = tocToMarkdown(toc);
    expect(md).toContain('- [Title](#title)');
    expect(md).toContain('  - [Section 1](#section-1)');
    expect(md).toContain('  - [Section 2](#section-2)');
  });
});

describe('analyzeStyle', () => {
  it('counts words correctly', () => {
    const report = analyzeStyle('<p>Hello world this is a test document</p>');
    expect(report.totalWords).toBe(7);
  });

  it('counts headings', () => {
    const report = analyzeStyle('<h1>Title</h1><h2>Sub</h2><p>Content</p>');
    expect(report.headingCount).toBe(2);
  });

  it('detects missing headings in long docs', () => {
    const longDoc = '<p>' + 'word '.repeat(300) + '</p>';
    const report = analyzeStyle(longDoc);
    expect(report.suggestions.some(s => s.type === 'structure')).toBe(true);
  });

  it('calculates readability score', () => {
    const report = analyzeStyle('<p>The quick brown fox jumps over the lazy dog.</p>');
    expect(report.readabilityScore).toBeGreaterThan(0);
    expect(report.readabilityScore).toBeLessThanOrEqual(100);
  });

  it('counts images and links', () => {
    const report = analyzeStyle('<p><img src="test.jpg"/><a href="#">link</a></p>');
    expect(report.imageCount).toBe(1);
    expect(report.linkCount).toBe(1);
  });
});

describe('summarizeDiff', () => {
  it('detects identical content', () => {
    const result = summarizeDiff('<p>Hello world</p>', '<p>Hello world</p>');
    expect(result.summary).toContain('No changes');
  });

  it('detects additions', () => {
    const result = summarizeDiff('<p>Hello</p>', '<p>Hello world</p>');
    expect(result.added).toBeGreaterThan(0);
  });

  it('detects removals', () => {
    const result = summarizeDiff('<p>Hello world foo bar</p>', '<p>Hello world</p>');
    expect(result.removed).toBeGreaterThan(0);
  });

  it('detects new sections', () => {
    const old = '<h1>Old Section</h1><p>Content</p>';
    const new_ = '<h1>Old Section</h1><h2>New Section</h2><p>New content</p>';
    const result = summarizeDiff(old, new_);
    expect(result.sectionsAdded).toContain('New Section');
  });

  it('detects removed sections', () => {
    const old = '<h1>Section A</h1><h2>Section B</h2><p>Content</p>';
    const new_ = '<h1>Section A</h1><p>Content</p>';
    const result = summarizeDiff(old, new_);
    expect(result.sectionsRemoved).toContain('Section B');
  });
});
