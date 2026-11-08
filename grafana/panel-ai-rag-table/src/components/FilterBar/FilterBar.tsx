import { GrafanaTheme2 } from '@grafana/data';
import { Button, IconButton, Input, Select, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import React, { useCallback } from 'react';

import { FILTER_OPERATORS } from '../../constants';
import { ColumnFilter, FilterLogic, FilterOperator } from '../../types';

interface Props {
  filters: ColumnFilter[];
  logic: FilterLogic;
  columns: string[];
  onFiltersChange: (filters: ColumnFilter[]) => void;
  onLogicChange: (logic: FilterLogic) => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  root: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.75)};
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.secondary};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  row: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.75)};
    flex-wrap: wrap;
  `,
  logicToggle: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,
  addBtn: css`
    align-self: flex-start;
    margin-top: ${theme.spacing(0.25)};
  `,
  colSelect: css`
    min-width: 140px;
  `,
  opSelect: css`
    min-width: 160px;
  `,
  valueInput: css`
    min-width: 140px;
    flex: 1;
  `,
});

const LOGIC_OPTIONS = [
  { value: 'AND' as FilterLogic, label: 'AND' },
  { value: 'OR' as FilterLogic, label: 'OR' },
];

const OPERATOR_OPTIONS = FILTER_OPERATORS.map((o) => ({ value: o.value as FilterOperator, label: o.label }));

export const FilterBar: React.FC<Props> = ({ filters, logic, columns, onFiltersChange, onLogicChange }) => {
  const styles = useStyles2(getStyles);

  const columnOptions = columns.map((c) => ({ value: c, label: c }));

  const handleAdd = useCallback(() => {
    onFiltersChange([
      ...filters,
      { column: columns[0] ?? '', operator: 'contains' as FilterOperator, value: '' },
    ]);
  }, [filters, columns, onFiltersChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onFiltersChange(filters.filter((_, i) => i !== index));
    },
    [filters, onFiltersChange]
  );

  const handleChange = useCallback(
    (index: number, patch: Partial<ColumnFilter>) => {
      onFiltersChange(filters.map((f, i) => (i === index ? { ...f, ...patch } : f)));
    },
    [filters, onFiltersChange]
  );

  return (
    <div className={styles.root}>
      {filters.map((filter, index) => (
        <div key={index} className={styles.row}>
          {index > 0 && (
            <div className={styles.logicToggle}>
              <Select
                value={logic}
                options={LOGIC_OPTIONS}
                onChange={(v) => onLogicChange(v.value!)}
                width={8}
              />
            </div>
          )}
          <div className={styles.colSelect}>
            <Select
              value={filter.column}
              options={columnOptions}
              onChange={(v) => handleChange(index, { column: v.value! })}
              placeholder="Column"
            />
          </div>
          <div className={styles.opSelect}>
            <Select
              value={filter.operator}
              options={OPERATOR_OPTIONS}
              onChange={(v) => handleChange(index, { operator: v.value! })}
            />
          </div>
          <div className={styles.valueInput}>
            <Input
              value={filter.value}
              onChange={(e) => handleChange(index, { value: e.currentTarget.value })}
              placeholder="value…"
            />
          </div>
          <IconButton name="times" aria-label="Remove filter" onClick={() => handleRemove(index)} />
        </div>
      ))}

      <Button
        className={styles.addBtn}
        variant="secondary"
        size="sm"
        icon="plus"
        onClick={handleAdd}
        disabled={columns.length === 0}
      >
        Add filter
      </Button>
    </div>
  );
};
