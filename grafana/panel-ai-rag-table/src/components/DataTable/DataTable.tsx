import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import React, { useMemo } from 'react';

import { FilteredRow } from '../../types';

interface Props {
  rows: FilteredRow[];
  columns: string[];
  totalRows: number;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    overflow: auto;
    flex: 1;
    min-height: 0;
  `,
  table: css`
    width: 100%;
    border-collapse: collapse;
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  thead: css`
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${theme.colors.background.secondary};
  `,
  th: css`
    padding: ${theme.spacing(0.5, 1)};
    text-align: left;
    border-bottom: 2px solid ${theme.colors.border.medium};
    font-weight: ${theme.typography.fontWeightMedium};
    white-space: nowrap;
    color: ${theme.colors.text.primary};
  `,
  td: css`
    padding: ${theme.spacing(0.5, 1)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    color: ${theme.colors.text.primary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  `,
  tr: css`
    &:hover td {
      background: ${theme.colors.action.hover};
    }
  `,
  rowCount: css`
    padding: ${theme.spacing(0.5, 1)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    border-top: 1px solid ${theme.colors.border.weak};
    flex-shrink: 0;
  `,
  empty: css`
    text-align: center;
    padding: ${theme.spacing(4)};
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.body.fontSize};
  `,
});

export const DataTable: React.FC<Props> = ({ rows, columns, totalRows }) => {
  const styles = useStyles2(getStyles);

  const visibleColumns = useMemo(() => {
    if (columns.length) {
      return columns;
    }
    if (rows.length) {
      return Object.keys(rows[0]);
    }
    return [];
  }, [columns, rows]);

  return (
    <>
      <div className={styles.wrapper}>
        {visibleColumns.length === 0 ? (
          <div className={styles.empty}>No data to display.</div>
        ) : (
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col} className={styles.th}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className={styles.empty}>
                    No rows match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className={styles.tr}>
                    {visibleColumns.map((col) => (
                      <td key={col} className={styles.td} title={String(row[col] ?? '')}>
                        {row[col] == null ? '' : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className={styles.rowCount}>
        {rows.length} / {totalRows} rows
      </div>
    </>
  );
};
