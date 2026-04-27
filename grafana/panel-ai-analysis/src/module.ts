import { PanelPlugin } from '@grafana/data';
import { PanelAIOptions } from './types';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DEFAULT_PROMPT } from './constants';

export const plugin = new PanelPlugin<PanelAIOptions>(AnalysisPanel)
  .setPanelOptions((builder) => {
    builder
      // ── Mode ──
      .addSelect({
        path: 'mode',
        name: 'Panel Mode',
        description:
          'Analyze: AI analysis of existing panel query data. ' +
          'Ask: Chat-style financial Q&A that queries InfluxDB directly.',
        defaultValue: 'analyze',
        settings: {
          options: [
            { value: 'analyze', label: 'Analyze (panel data)' },
            { value: 'ask', label: 'Ask (financial Q&A)' },
          ],
        },
        category: ['Mode'],
      })

      // ── Prompt (persisted on dashboard save) ──
      .addTextInput({
        path: 'prompt',
        name: 'Analysis Prompt',
        description:
          'Custom prompt sent to the AI model. Leave blank to use the built-in default. ' +
          'This value is saved with the dashboard.',
        defaultValue: DEFAULT_PROMPT,
        settings: { useTextarea: true, rows: 6 },
        category: ['Prompt'],
        showIf: (opts) => opts.mode !== 'ask',
      })

      // ── Auto-analyze toggle ──
      .addBooleanSwitch({
        path: 'autoAnalyze',
        name: 'Auto-analyze on data refresh',
        description: 'Automatically re-run analysis when panel data changes',
        defaultValue: false,
        category: ['Behavior'],
        showIf: (opts) => opts.mode !== 'ask',
      })

      // ── LLM Provider ──
      .addSelect({
        path: 'llm.provider',
        name: 'LLM Provider',
        description:
          'Select which LLM backend to use. Environment variables supply defaults ' +
          'for endpoint, model, and API key; values set here override them.',
        defaultValue: '',
        settings: {
          options: [
            { value: '', label: 'Server default (env var)' },
            { value: 'gemini', label: 'Google Gemini' },
            { value: 'ollama', label: 'Ollama (local)' },
            { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
          ],
        },
        category: ['LLM Provider'],
      })
      .addTextInput({
        path: 'llm.endpoint',
        name: 'Endpoint URL',
        description:
          'API endpoint. Leave blank to use the environment default. ' +
          'For Ollama: http://localhost:11434 | For OpenAI: https://api.openai.com/v1',
        defaultValue: '',
        category: ['LLM Provider'],
      })
      .addTextInput({
        path: 'llm.model',
        name: 'Model',
        description:
          'Model name. Leave blank for the environment default. ' +
          'Examples: gemini-2.0-flash-exp, llama3.1, gpt-4o',
        defaultValue: '',
        category: ['LLM Provider'],
      })
      .addTextInput({
        path: 'llm.apiKey',
        name: 'API Key',
        description:
          'API key for the provider. Not required for Ollama. ' +
          'Leave blank to use the environment variable.',
        defaultValue: '',
        category: ['LLM Provider'],
      })

      // ── InfluxDB (Ask mode only) ──
      .addTextInput({
        path: 'influxdb.url',
        name: 'InfluxDB URL',
        description:
          'InfluxDB URL override for Ask mode. Leave blank to use the INFLUXDB_HOST environment variable.',
        defaultValue: '',
        category: ['InfluxDB (Ask mode)'],
        showIf: (opts) => opts.mode === 'ask',
      })
      .addTextInput({
        path: 'influxdb.token',
        name: 'InfluxDB Token',
        description: 'Leave blank to use INFLUXDB_TOKEN env var.',
        defaultValue: '',
        category: ['InfluxDB (Ask mode)'],
        showIf: (opts) => opts.mode === 'ask',
      })
      .addTextInput({
        path: 'influxdb.org',
        name: 'InfluxDB Org',
        description: 'Leave blank to use INFLUXDB_ORG env var.',
        defaultValue: '',
        category: ['InfluxDB (Ask mode)'],
        showIf: (opts) => opts.mode === 'ask',
      })
      .addTextInput({
        path: 'influxdb.bucket',
        name: 'InfluxDB Bucket',
        description: 'Leave blank to use INFLUXDB_BUCKET env var.',
        defaultValue: '',
        category: ['InfluxDB (Ask mode)'],
        showIf: (opts) => opts.mode === 'ask',
      })
      .addNumberInput({
        path: 'influxdb.timeout',
        name: 'InfluxDB Timeout (seconds)',
        description:
          'HTTP timeout for InfluxDB requests including schema discovery and query execution. ' +
          'Default is 60 seconds. Increase if queries are timing out.',
        defaultValue: 60,
        settings: { min: 5, max: 600, integer: true },
        category: ['InfluxDB (Ask mode)'],
        showIf: (opts) => opts.mode === 'ask',
      });
  });
