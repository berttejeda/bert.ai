import { PanelPlugin } from '@grafana/data';
import { PanelAIOptions } from './types';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DEFAULT_PROMPT } from './constants';

export const plugin = new PanelPlugin<PanelAIOptions>(AnalysisPanel)
  .setPanelOptions((builder) => {
    builder
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
      })

      // ── Auto-analyze toggle ──
      .addBooleanSwitch({
        path: 'autoAnalyze',
        name: 'Auto-analyze on data refresh',
        description: 'Automatically re-run analysis when panel data changes',
        defaultValue: false,
        category: ['Behavior'],
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
      });
  });
