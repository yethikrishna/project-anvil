// ============================================================
// lib/cell-utils.ts — Cell address helpers and formatting
// ============================================================
import { CellValue, NumberFormat } from './types';

/** Convert 0-based column index to letter(s): 0→A, 25→Z, 26→AA */
export function colIndexToLetter(n: number): string {
  let result = '';
  n = n + 1; // 1-based
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** Convert column letter(s) to 0-based index: A→0, Z→25, AA→26 */
export function letterToColIndex(s: string): number {
  s = s.toUpperCase();
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    result = result * 26 + (s.charCodeAt(i) - 64);
  }
  return result - 1;
}

/** Parse A1 notation to {row, col} (0-based) */
export function parseA1Notation(ref: string): { row: number; col: number } | null {
  // Strip $ signs for absolute references
  const clean = ref.replace(/\$/g, '');
  const match = clean.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const col = letterToColIndex(match[1]);
  const row = parseInt(match[2], 10) - 1;
  return { row, col };
}

/** Convert range to A1 notation: "A1:B3" */
export function rangeToA1(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): string {
  const start = `${colIndexToLetter(startCol)}${startRow + 1}`;
  if (startRow === endRow && startCol === endCol) return start;
  const end = `${colIndexToLetter(endCol)}${endRow + 1}`;
  return `${start}:${end}`;
}

/** Get all cells in a range as array of {row, col} */
export function getCellsInRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  const r1 = Math.min(startRow, endRow);
  const r2 = Math.max(startRow, endRow);
  const c1 = Math.min(startCol, endCol);
  const c2 = Math.max(startCol, endCol);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** Check if value is numeric */
export function isNumeric(v: unknown): v is number {
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v));
  return false;
}

/** Cell key: "row:col" */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** Parse cell key back to {row, col} */
export function parseCellKey(key: string): { row: number; col: number } {
  const [r, c] = key.split(':').map(Number);
  return { row: r, col: c };
}

/** Format a cell value according to format spec */
export function formatCellValue(value: CellValue, format?: NumberFormat | string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  const fmt = format ?? 'general';

  // Error passthrough
  if (typeof value === 'string' && value.startsWith('#')) return value;

  switch (fmt) {
    case 'general':
      if (typeof value === 'number') {
        // Auto-format: up to 9 significant digits, remove trailing zeros
        return parseFloat(value.toPrecision(9)).toString();
      }
      return String(value);

    case 'number':
      if (typeof value === 'number') return value.toFixed(2);
      return String(value);

    case 'currency':
      if (typeof value === 'number') {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(value);
      }
      return String(value);

    case 'percentage':
      if (typeof value === 'number') {
        return `${(value * 100).toFixed(2)}%`;
      }
      return String(value);

    case 'date': {
      const d = typeof value === 'number' ? excelSerialToDate(value) : new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('en-US');
    }

    case 'time': {
      const d = typeof value === 'number' ? excelSerialToDate(value) : new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleTimeString('en-US');
    }

    case 'datetime': {
      const d = typeof value === 'number' ? excelSerialToDate(value) : new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString('en-US');
    }

    case 'scientific':
      if (typeof value === 'number') return value.toExponential(2);
      return String(value);

    case 'text':
      return String(value);

    default:
      // Custom format string
      return applyCustomFormat(value, fmt);
  }
}

/** Convert Excel serial date (days since 1900-01-01) to JS Date */
function excelSerialToDate(serial: number): Date {
  // Excel's epoch: Jan 1, 1900 = 1
  const epoch = new Date(1899, 11, 30);
  epoch.setDate(epoch.getDate() + serial);
  return epoch;
}

/** Basic custom format (supports #,##0.00, 0%, etc.) */
function applyCustomFormat(value: CellValue, fmt: string): string {
  if (typeof value !== 'number') return String(value ?? '');

  if (fmt.includes('%')) {
    const decimals = (fmt.match(/\.0+/) ?? [''])[0].length - 1;
    return `${(value * 100).toFixed(Math.max(0, decimals))}%`;
  }

  if (fmt.includes(',')) {
    const parts = fmt.split('.');
    const decimals = parts[1] ? parts[1].replace(/[^0#]/g, '').length : 0;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  if (fmt.includes('.')) {
    const decimals = fmt.split('.')[1].replace(/[^0#]/g, '').length;
    return value.toFixed(decimals);
  }

  return parseFloat(value.toPrecision(9)).toString();
}

/** Parse a range string like "A1:B3" or "A1" into row/col bounds */
export function parseRange(rangeStr: string): {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
} | null {
  const parts = rangeStr.split(':');
  const start = parseA1Notation(parts[0].trim());
  if (!start) return null;
  if (parts.length === 1) {
    return { startRow: start.row, startCol: start.col, endRow: start.row, endCol: start.col };
  }
  const end = parseA1Notation(parts[1].trim());
  if (!end) return null;
  return {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col),
  };
}

/** Normalize a range so start ≤ end */
export function normalizeRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
) {
  return {
    startRow: Math.min(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endRow: Math.max(startRow, endRow),
    endCol: Math.max(startCol, endCol),
  };
}

/** Check if a cell is within a range */
export function isInRange(
  row: number,
  col: number,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): boolean {
  return row >= startRow && row <= endRow && col >= startCol && col <= endCol;
}
