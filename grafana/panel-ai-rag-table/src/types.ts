// ---------- LLM Provider ----------

export type LLMProvider = 'gemini' | 'ollama' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider | '';
  endpoint: string;
  model: string;
  apiKey: string;
}

// ---------- Filter model (mirrors the cost-model HTML inputs) ----------

export type FilterOperator = 'contains' | 'not_contains' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex';

export interface ColumnFilter {
  /** Column name to filter on */
  column: string;
  /** Comparison operator */
  operator: FilterOperator;
  /** Value to compare against */
  value: string;
}

export type FilterLogic = 'AND' | 'OR';

export interface FilterConfig {
  /** Active column filters */
  filters: ColumnFilter[];
  /** How filters are combined */
  logic: FilterLogic;
  /** Show the filter bar inside the panel */
  showFilterBar: boolean;
}

// ---------- Panel Options ----------

export interface PanelOptions {
  /** LLM provider settings */
  llm: LLMConfig;
  /** Filter configuration */
  filterConfig: FilterConfig;
  /** Prompt template used for RAG analysis */
  analysisPrompt: string;
  /** Auto-run analysis when data refreshes */
  autoAnalyze: boolean;
  /** Max table rows to include in RAG context */
  ragContextRows: number;
  /** Show AI analysis panel below the table */
  showAnalysisPanel: boolean;
  /** Height in px of the AI analysis panel */
  analysisPanelHeight: number;
}

// ---------- Backend request / response ----------

export interface SerializedField {
  name: string;
  type: string;
  values: unknown[];
  labels?: Record<string, string>;
}

export interface SerializedDataFrame {
  name: string;
  fields: SerializedField[];
  length: number;
  sampled?: boolean;
  originalLength?: number;
}

export interface TemplateVariableInfo {
  name: string;
  label?: string;
  current: string;
  type: string;
}

export interface FilteredRow {
  /** Column name → cell value */
  [key: string]: unknown;
}

export interface RagAnalyzeRequest {
  queryResults: SerializedDataFrame[];
  filteredRows: FilteredRow[];
  activeFilters: ColumnFilter[];
  filterLogic: FilterLogic;
  prompt: string;
  llm: LLMConfig;
  resolvedVariables: TemplateVariableInfo[];
}

export interface RagAnalyzeResponse {
  analysis: string;
  /** How many rows were actually in the RAG context */
  contextRows: number;
  /** How many rows matched the active filters */
  totalFilteredRows: number;
}

// ---------- Provider info ----------

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  configured: boolean;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
  serverDefault: {
    provider: string;
    endpoint: string;
    model: string;
    hasKey: boolean;
  };
}

// ---------- Chat message ----------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  contextRows?: number;
  totalFilteredRows?: number;
}
