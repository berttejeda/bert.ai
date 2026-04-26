export const DEFAULT_PROMPT = `You are an expert data analyst reviewing Grafana panel data.

Given the panel configuration and query results below, provide:
1. A summary of what metrics/data are being displayed
2. Key trends or patterns in the data
3. Any anomalies or notable observations
4. Actionable insights or recommendations

Be concise but thorough. Use bullet points for clarity.`;

export const PLUGIN_ID = 'bertai-panel-ai-analysis';

export const MAX_DATA_POINTS = 500;

export const SAMPLE_HEAD = 50;
export const SAMPLE_TAIL = 50;
