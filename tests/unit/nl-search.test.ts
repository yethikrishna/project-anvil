/**
 * Unit tests for @anvil/ai — natural language query parser
 */

import {describe, it, expect} from 'vitest';
import {parseNaturalLanguageQuery} from '@anvil/ai/tools/nl-search.js';

describe('parseNaturalLanguageQuery', () => {
  it('parses "find the contract I sent to Acme Corp"', () => {
    const result = parseNaturalLanguageQuery('find the contract I sent to Acme Corp');
    expect(result.query).toContain('contract');
    expect(result.recipient).toBe('Acme Corp');
    expect(result.entities.some(e => e.type === 'person')).toBe(true);
  });

  it('parses "show me photos from last summer"', () => {
    const result = parseNaturalLanguageQuery('show me photos from last summer');
    expect(result.fileType).toContain('image');
    expect(result.app).toBe('drive');
  });

  it('parses "emails from John about the budget"', () => {
    const result = parseNaturalLanguageQuery('emails from John about the budget');
    expect(result.sender).toBe('John');
    expect(result.query).toContain('budget');
    expect(result.app).toBe('gmail');
  });

  it('parses "recent documents"', () => {
    const result = parseNaturalLanguageQuery('recent documents');
    expect(result.sort).toBe('date');
    expect(result.fileType).toContain('wordprocessingml');
  });

  it('parses "find spreadsheets"', () => {
    const result = parseNaturalLanguageQuery('find spreadsheets');
    expect(result.fileType).toContain('spreadsheetml');
    expect(result.app).toBe('drive');
  });

  it('parses date expressions: "today"', () => {
    const result = parseNaturalLanguageQuery('files from today');
    const today = new Date().toISOString().split('T')[0];
    expect(result.dateFrom).toBe(today);
    expect(result.dateTo).toBe(today);
  });

  it('parses date expressions: "yesterday"', () => {
    const result = parseNaturalLanguageQuery('files from yesterday');
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    expect(result.dateFrom).toBe(yesterday);
  });

  it('parses date expressions: "this week"', () => {
    const result = parseNaturalLanguageQuery('emails this week');
    expect(result.dateFrom).toBeTruthy();
    expect(result.dateTo).toBeTruthy();
  });

  it('extracts person entities', () => {
    const result = parseNaturalLanguageQuery('files from Sarah Chen');
    expect(result.sender).toBe('Sarah Chen');
    expect(result.entities.some(e => e.type === 'person' && e.value === 'Sarah Chen')).toBe(true);
  });

  it('defaults to all apps', () => {
    const result = parseNaturalLanguageQuery('random search query');
    expect(result.app).toBe('all');
  });

  it('preserves original query', () => {
    const input = 'find the contract I sent to Acme Corp';
    const result = parseNaturalLanguageQuery(input);
    expect(result.original).toBe(input);
  });
});
