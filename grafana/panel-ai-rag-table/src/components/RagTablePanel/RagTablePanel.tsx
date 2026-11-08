import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { DEFAULT_ANALYSIS_PROMPT } from '../../constants';
import { ColumnFilter, FilterLogic, PanelOptions, TemplateVariableInfo } from '../../types';
import { applyFiltersToFrames, getColumnNames } from '../../utils/filterEngine';
import { serializeDataFrames } from '../../utils/dataSerializer';
import { FilterBar } from '../FilterBar/FilterBar';
import { DataTable } from '../DataTable/DataTable';
import { AnalysisPanel } from '../AnalysisPanel/AnalysisPanel';

interface Props extends PanelProps<PanelOptions> {}

const getStyles = (theme: GrafanaTheme2) => ({
  root: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: ${theme.colors.background.primary};
  `,
  tableSection: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  `,
});

/**
 * Extracts resolved template variables from the Grafana template service.
 */
function getResolvedVariables(): TemplateVariableInfo[] {
  try {
    return getTemplateSrv()
      .getVariables()
      .map((v: any) => ({
        name: v.name,
        label: v.label,
        current: String(v.current?.value ?? ''),
        type: v.type,
      }));
  } catch {
    return [];
  }
}

export const RagTablePanel: React.FC<Props> = ({ data, options, width, height }) => {
  const styles = useStyles2(getStyles);

  const [filters, setFilters] = useState<ColumnFilter[]>(options.filterConfig?.filters ?? []);
  const [filterLogic, setFilterLogic] = useState<FilterLogic>(options.filterConfig?.logic ?? 'AND');
  const dataVersionRef = useRef(0);

  const columns = useMemo(() => getColumnNames(data.series ?? []), [data.series]);

  const allFrames = useMemo(() => serializeDataFrames(data.series ?? []), [data.series]);

  const filteredRows = useMemo(() => {
    dataVersionRef.current += 1;
    return applyFiltersToFrames(data.series ?? [], filters, filterLogic);
  }, [data.series, filters, filterLogic]);

  const totalRows = useMemo(
    () => (data.series ?? []).reduce((sum, f) => sum + f.length, 0),
    [data.series]
  );

  const handleFiltersChange = useCallback((next: ColumnFilter[]) => {
    setFilters(next);
  }, []);

  const handleLogicChange = useCallback((next: FilterLogic) => {
    setFilterLogic(next);
  }, []);

  const showAnalysis = options.showAnalysisPanel !== false;
  const analysisPanelHeight = options.analysisPanelHeight ?? 200;
  const tableSectionHeight = showAnalysis ? height - analysisPanelHeight : height;

  return (
    <div className={styles.root} style={{ width, height }}>
      <div className={styles.tableSection} style={{ height: tableSectionHeight }}>
        {(options.filterConfig?.showFilterBar !== false) && (
          <FilterBar
            filters={filters}
            logic={filterLogic}
            columns={columns}
            onFiltersChange={handleFiltersChange}
            onLogicChange={handleLogicChange}
          />
        )}
        <DataTable rows={filteredRows} columns={columns} totalRows={totalRows} />
      </div>

      {showAnalysis && (
        <AnalysisPanel
          llm={options.llm ?? { provider: '', endpoint: '', model: '', apiKey: '' }}
          prompt={options.analysisPrompt || DEFAULT_ANALYSIS_PROMPT}
          filteredRows={filteredRows}
          allFrames={allFrames}
          activeFilters={filters}
          filterLogic={filterLogic}
          resolvedVariables={getResolvedVariables()}
          ragContextRows={options.ragContextRows ?? 50}
          autoAnalyze={options.autoAnalyze ?? false}
          height={analysisPanelHeight}
          dataVersion={dataVersionRef.current}
        />
      )}
    </div>
  );
};
