import { PanelPlugin } from '@grafana/data';

import { DEFAULT_ANALYSIS_PROMPT, DEFAULT_ANALYSIS_PANEL_HEIGHT, DEFAULT_RAG_CONTEXT_ROWS } from './constants';
import { RagTablePanel } from './components/RagTablePanel/RagTablePanel';
import { PanelOptions } from './types';

/**
 * Panel Plugin — AI RAG Table
 */
export const plugin = new PanelPlugin<PanelOptions>(RagTablePanel).setPanelOptions((builder) => {
  builder

    // ── Filter Bar ──────────────────────────────────────────────────
    .addBooleanSwitch({
      path: 'filterConfig.showFilterBar',
      name: 'Show filter bar',
      description: 'Render the interactive filter bar above the table.',
      defaultValue: true,
      category: ['Filters'],
    })
    .addRadio({
      path: 'filterConfig.logic',
      name: 'Filter logic',
      description: 'How multiple filters are combined.',
      settings: {
        options: [
          { value: 'AND', label: 'AND — all must match' },
          { value: 'OR', label: 'OR — any must match' },
        ],
      },
      defaultValue: 'AND',
      category: ['Filters'],
    })

    // ── AI Analysis ─────────────────────────────────────────────────
    .addBooleanSwitch({
      path: 'showAnalysisPanel',
      name: 'Show AI analysis panel',
      description: 'Display the RAG-powered AI analysis section below the table.',
      defaultValue: true,
      category: ['AI Analysis'],
    })
    .addNumberInput({
      path: 'analysisPanelHeight',
      name: 'Analysis panel height (px)',
      description: 'Pixel height reserved for the AI analysis section.',
      defaultValue: DEFAULT_ANALYSIS_PANEL_HEIGHT,
      settings: { min: 80, max: 800, integer: true },
      category: ['AI Analysis'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })
    .addTextInput({
      path: 'analysisPrompt',
      name: 'Analysis prompt',
      description: 'Custom prompt template sent to the LLM along with the filtered table rows.',
      defaultValue: DEFAULT_ANALYSIS_PROMPT,
      settings: { useTextarea: true, rows: 6 },
      category: ['AI Analysis'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })
    .addBooleanSwitch({
      path: 'autoAnalyze',
      name: 'Auto-analyze on data refresh',
      description: 'Automatically re-run analysis when the panel data or filters change.',
      defaultValue: false,
      category: ['AI Analysis'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })
    .addNumberInput({
      path: 'ragContextRows',
      name: 'RAG context rows',
      description: 'Maximum number of filtered rows to include in the LLM context window.',
      defaultValue: DEFAULT_RAG_CONTEXT_ROWS,
      settings: { min: 1, max: 500, integer: true },
      category: ['AI Analysis'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })

    // ── LLM Provider ────────────────────────────────────────────────
    .addSelect({
      path: 'llm.provider',
      name: 'LLM Provider',
      description: 'Select the LLM backend. Leave blank to use the server default set via environment variables.',
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
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })
    .addTextInput({
      path: 'llm.endpoint',
      name: 'Endpoint URL',
      description: 'Leave blank to use the environment default. Example: http://localhost:11434 or https://api.openai.com/v1',
      defaultValue: '',
      category: ['LLM Provider'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })
    .addTextInput({
      path: 'llm.model',
      name: 'Model',
      description: 'Leave blank for the environment default. Examples: gemini-2.0-flash-exp, llama3.1, gpt-4o',
      defaultValue: '',
      category: ['LLM Provider'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    })
    .addTextInput({
      path: 'llm.apiKey',
      name: 'API Key',
      description: 'Leave blank to use the environment variable. Not required for Ollama.',
      defaultValue: '',
      category: ['LLM Provider'],
      showIf: (opts) => opts.showAnalysisPanel !== false,
    });
});
