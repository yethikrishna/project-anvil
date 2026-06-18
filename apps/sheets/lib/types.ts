// ============================================================
// lib/types.ts — Core TypeScript types for Anvil Sheets
// ============================================================

// ---- Primitive cell value ----
export type CellValue = string | number | boolean | null;

// ---- Formula result ----
export type FormulaError =
  | '#DIV/0!'
  | '#VALUE!'
  | '#REF!'
  | '#NAME?'
  | '#NUM!'
  | '#N/A'
  | '#NULL!'
  | '#CIRC!';

export type FormulaResult = CellValue | FormulaError;

export function isFormulaError(v: unknown): v is FormulaError {
  return (
    typeof v === 'string' &&
    (v === '#DIV/0!' ||
      v === '#VALUE!' ||
      v === '#REF!' ||
      v === '#NAME?' ||
      v === '#NUM!' ||
      v === '#N/A' ||
      v === '#NULL!' ||
      v === '#CIRC!')
  );
}

// ---- Cell formatting ----
export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type BorderStyle = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted';

export interface CellBorder {
  style: BorderStyle;
  color: string;
}

export interface CellBorders {
  top?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
  right?: CellBorder;
}

export type NumberFormat =
  | 'general'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'time'
  | 'datetime'
  | 'scientific'
  | 'text'
  | 'custom';

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  fillColor?: string;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  wrapText?: boolean;
  numberFormat?: NumberFormat;
  customFormat?: string;
  borders?: CellBorders;
}

export interface CellStyle extends CellFormat {
  // Alias — CellStyle and CellFormat are the same
}

// ---- Cell ----
export interface Cell {
  row: number;
  col: number;
  /** Raw user input (may start with = for formulas) */
  raw: string;
  /** Computed display value (after formula evaluation) */
  computed: CellValue;
  /** Error from formula evaluation (if any) */
  error?: FormulaError;
  /** Formatting */
  format?: CellFormat;
  /** Merged cell: this cell spans to (mergeEndRow, mergeEndCol) */
  mergeEndRow?: number;
  mergeEndCol?: number;
  /** If true, this cell is hidden under a merge */
  isMerged?: boolean;
}

// ---- Range & Selection ----
export interface CellRef {
  row: number;
  col: number;
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface Selection {
  /** Single anchor point */
  anchor: CellRef;
  /** Active (current) cursor position */
  active: CellRef;
  /** Additional ranges for multi-select (Ctrl+click) */
  extra?: CellRange[];
}

// ---- Sheet ----
export interface Sheet {
  id: string;
  name: string;
  /** Sparse map: "${row}:${col}" → Cell */
  cells: Record<string, Cell>;
  /** Column widths (col index → px) */
  colWidths: Record<number, number>;
  /** Row heights (row index → px) */
  rowHeights: Record<number, number>;
  /** Number of frozen rows */
  frozenRows: number;
  /** Number of frozen cols */
  frozenCols: number;
  /** Conditional formatting rules */
  conditionalFormats: ConditionalFormat[];
  /** Charts on this sheet */
  charts: ChartConfig[];
  /** Hidden rows */
  hiddenRows: number[];
  /** Hidden cols */
  hiddenCols: number[];
  /** Filter state */
  filterRow?: number;
}

// ---- Workbook ----
export interface Workbook {
  id: string;
  title: string;
  sheets: Sheet[];
  activeSheetId: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Resize State ----
export interface ResizeState {
  type: 'col' | 'row';
  index: number;
  startX: number;
  startY: number;
  startSize: number;
}

// ---- Chart Types ----
export type ChartType =
  | 'bar'
  | 'bar-stacked'
  | 'line'
  | 'line-markers'
  | 'pie'
  | 'scatter'
  | 'area';

export interface ChartSeries {
  name: string;
  dataKey: string;
  color: string;
}

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  dataRange: string;
  series: ChartSeries[];
  showLegend: boolean;
  legendPosition: 'top' | 'right' | 'bottom' | 'left' | 'none';
  showAxisLabels: boolean;
  /** Position on sheet (px from top-left of grid) */
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---- Conditional Formatting ----
export type ConditionalRuleType =
  | 'cellValue'
  | 'textContains'
  | 'dateBefore'
  | 'dateAfter'
  | 'formula'
  | 'aboveAverage'
  | 'belowAverage'
  | 'duplicateValues'
  | 'uniqueValues';

export type ConditionalOperator =
  | 'greaterThan'
  | 'lessThan'
  | 'equalTo'
  | 'notEqualTo'
  | 'between'
  | 'notBetween'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

export interface ConditionalFormat {
  id: string;
  range: CellRange;
  ruleType: ConditionalRuleType;
  operator?: ConditionalOperator;
  value1?: CellValue;
  value2?: CellValue;
  formula?: string;
  format: CellFormat;
  priority: number;
  stopIfTrue: boolean;
}

// ---- Undo/Redo History ----
export type SheetActionType =
  | 'setCellValue'
  | 'setFormat'
  | 'insertRow'
  | 'deleteRow'
  | 'insertCol'
  | 'deleteCol'
  | 'mergeRange'
  | 'unmergeRange'
  | 'resizeCol'
  | 'resizeRow'
  | 'addSheet'
  | 'deleteSheet'
  | 'renameSheet'
  | 'moveSheet'
  | 'paste'
  | 'clear';

export interface SheetAction {
  type: SheetActionType;
  sheetId: string;
  /** Before-state snapshot for undo */
  before: Partial<Sheet>;
  /** After-state snapshot for redo */
  after: Partial<Sheet>;
  /** Human-readable description */
  description: string;
  timestamp: number;
}

// ---- Clipboard ----
export type ClipboardOperation = 'copy' | 'cut';

export interface ClipboardState {
  operation: ClipboardOperation;
  range: CellRange;
  sheetId: string;
  /** Copied cells keyed by "row:col" */
  cells: Record<string, Cell>;
}

// ---- Column/Row resize dragging ----
export interface ColResizeDrag {
  col: number;
  startX: number;
  startWidth: number;
}

export interface RowResizeDrag {
  row: number;
  startY: number;
  startHeight: number;
}

// ---- Default dimensions ----
export const DEFAULT_COL_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 25;
export const COL_HEADER_HEIGHT = 25;
export const ROW_HEADER_WIDTH = 46;
export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;
export const INITIAL_ROWS = 1000;
export const INITIAL_COLS = 26;
