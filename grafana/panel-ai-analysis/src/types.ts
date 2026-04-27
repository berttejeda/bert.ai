// ---------- LLM Provider Types ----------

export type LLMProvider = 'gemini' | 'ollama' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;
  endpoint: string;
  model: string;
  apiKey: string;
}

// ---------- Panel Options (persisted on dashboard save) ----------

export type PanelMode = 'analyze' | 'ask';

export interface InfluxDBConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  timeout?: number; // HTTP timeout in seconds; 0 or undefined = server default (60s)
}

export interface PanelAIOptions {
  mode: PanelMode;
  prompt: string;
  autoAnalyze: boolean;
  llm: LLMConfig;
  influxdb: InfluxDBConfig;
}

// ---------- Request / Response ----------

export interface AnalyzeRequest {
  panelJson: Record<string, unknown>;
  rawTargets: Record<string, unknown>[];
  resolvedVariables: TemplateVariableInfo[];
  queryResults: SerializedDataFrame[];
  prompt: string;
  llm: LLMConfig;
}

export interface TemplateVariableInfo {
  name: string;
  label?: string;
  current: string;
  type: string;
}

export interface SerializedDataFrame {
  name: string;
  fields: SerializedField[];
  length: number;
  sampled?: boolean;
  originalLength?: number;
}

export interface SerializedField {
  name: string;
  type: string;
  values: unknown[];
  labels?: Record<string, string>;
}

export interface AnalyzeResponse {
  analysis: string;
}

// ---------- Provider Info (from /providers endpoint) ----------

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  configured: boolean;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
}

// ---------- Ask (Financial Q&A) types ----------

export interface DashboardPanelSummary {
  id: number;
  title: string;
  type: string;
  queries: string[];
}

export interface DashboardContextPayload {
  title: string;
  description: string;
  panels: DashboardPanelSummary[];
}

export interface AskRequest {
  question: string;
  llm: LLMConfig;
  influxdb?: InfluxDBConfig;
  dashboardContext?: DashboardContextPayload;
}

export interface AskResponse {
  answer: string;
  fluxQuery?: string;
  rowCount: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fluxQuery?: string;
  rowCount?: number;
  timestamp: number;
}
