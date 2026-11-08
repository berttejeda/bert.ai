export const PLUGIN_ID = 'bertai-panel-ai-rag-table';

export const MAX_RAG_CONTEXT_ROWS = 200;
export const DEFAULT_RAG_CONTEXT_ROWS = 50;

export const DEFAULT_ANALYSIS_PROMPT = `You are an expert data analyst reviewing a filtered Grafana table.

The table data below has been filtered by the user. Based on the visible rows:
1. Summarize what the filtered data shows
2. Identify key patterns, trends, or outliers
3. Note anything the filter criteria reveal about the dataset
4. Provide actionable insights

Be concise. Use bullet points for clarity.`;

export const FILTER_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'regex', label: 'regex' },
] as const;

export const DEFAULT_ANALYSIS_PANEL_HEIGHT = 200;
