import { DataFrame } from '@grafana/data';

import { ColumnFilter, FilterLogic, FilteredRow } from '../types';

/**
 * Materializes a DataFrame into an array of row objects and applies
 * the given column filters using the specified logic (AND / OR).
 */
export function applyFilters(
  frame: DataFrame,
  filters: ColumnFilter[],
  logic: FilterLogic
): FilteredRow[] {
  const rows = materializeRows(frame);

  if (!filters.length) {
    return rows;
  }

  return rows.filter((row) => {
    const results = filters.map((f) => testFilter(row, f));
    return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  });
}

/**
 * Flattens all frames into filtered rows across the whole dataset.
 */
export function applyFiltersToFrames(
  frames: DataFrame[],
  filters: ColumnFilter[],
  logic: FilterLogic
): FilteredRow[] {
  return frames.flatMap((frame) => applyFilters(frame, filters, logic));
}

function materializeRows(frame: DataFrame): FilteredRow[] {
  const rows: FilteredRow[] = [];
  for (let i = 0; i < frame.length; i++) {
    const row: FilteredRow = {};
    for (const field of frame.fields) {
      row[field.name] = field.values[i];
    }
    rows.push(row);
  }
  return rows;
}

function testFilter(row: FilteredRow, filter: ColumnFilter): boolean {
  const raw = row[filter.column];
  const cellStr = raw == null ? '' : String(raw);
  const val = filter.value;

  switch (filter.operator) {
    case 'contains':
      return cellStr.toLowerCase().includes(val.toLowerCase());
    case 'not_contains':
      return !cellStr.toLowerCase().includes(val.toLowerCase());
    case 'eq':
      return cellStr === val;
    case 'neq':
      return cellStr !== val;
    case 'gt':
      return parseFloat(cellStr) > parseFloat(val);
    case 'gte':
      return parseFloat(cellStr) >= parseFloat(val);
    case 'lt':
      return parseFloat(cellStr) < parseFloat(val);
    case 'lte':
      return parseFloat(cellStr) <= parseFloat(val);
    case 'regex': {
      try {
        return new RegExp(val).test(cellStr);
      } catch {
        return false;
      }
    }
    default:
      return true;
  }
}

/**
 * Returns the unique column names across all frames.
 */
export function getColumnNames(frames: DataFrame[]): string[] {
  const names = new Set<string>();
  for (const frame of frames) {
    for (const field of frame.fields) {
      names.add(field.name);
    }
  }
  return Array.from(names).sort();
}
