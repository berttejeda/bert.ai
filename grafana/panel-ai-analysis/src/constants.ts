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

export const SUGGESTED_QUESTIONS = [
  'Which stocks are currently oversold (RSI below 30)?',
  'Show me the top 5 stocks by market cap',
  'Which stocks have a Piotroski score of 7 or higher?',
  'Compare trailing P/E vs forward P/E for all stocks',
  'Which stocks have the highest analyst target price upside?',
  'Show me stocks with both high F-Score and low RSI',
  'What is the current MACD signal for each stock?',
  'Which stocks have the highest short ratio?',
  'Show dividend yield for all stocks, sorted highest first',
  'Compare quarterly revenue growth across all tickers',
];
