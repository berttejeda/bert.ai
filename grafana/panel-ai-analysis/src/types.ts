// ---------- LLM Provider Types ----------

export type LLMProvider = 'gemini' | 'ollama' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;
  endpoint: string;
  model: string;
  apiKey: string;
}

// ---------- Panel Options (persisted on dashboard save) ----------

export interface PanelAIOptions {
  prompt: string;
  autoAnalyze: boolean;
  llm: LLMConfig;
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
