import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PanelProps } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { css } from '@emotion/css';
import { useStyles2, Spinner } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { PanelAIOptions, AnalyzeRequest, AnalyzeResponse } from '../types';
import { DEFAULT_PROMPT, PLUGIN_ID } from '../constants';
import { serializeDataFrames } from '../utils/dataSerializer';
import { extractPanelConfig, extractRawTargets, extractResolvedVariables } from '../utils/panelConfig';
import { AnalysisResult } from './AnalysisResult';
import { PromptEditor } from './PromptEditor';
import { ChatPanel } from './ChatPanel';

interface Props extends PanelProps<PanelAIOptions> {}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: ${theme.spacing(1)};
    overflow: hidden;
  `,
  controls: css`
    flex-shrink: 0;
    margin-bottom: ${theme.spacing(1)};
  `,
  analyzeButton: css`
    padding: ${theme.spacing(1, 2)};
    background: ${theme.colors.primary.main};
    color: ${theme.colors.primary.contrastText};
    border: none;
    border-radius: ${theme.shape.radius.default};
    cursor: pointer;
    font-size: ${theme.typography.body.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    &:hover {
      background: ${theme.colors.primary.shade};
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,
  resultArea: css`
    flex: 1;
    overflow: auto;
    min-height: 0;
  `,
  spinnerContainer: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  `,
  error: css`
    color: ${theme.colors.error.text};
    background: ${theme.colors.error.transparent};
    border: 1px solid ${theme.colors.error.border};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1.5)};
    font-size: ${theme.typography.body.fontSize};
  `,
  noData: css`
    color: ${theme.colors.text.secondary};
    text-align: center;
    padding: ${theme.spacing(4)};
    font-size: ${theme.typography.body.fontSize};
  `,
  providerStatus: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
});

interface ServerDefault {
  provider: string;
  endpoint: string;
  model: string;
}

export const AnalysisPanel: React.FC<Props> = ({ data, options, width, height, onOptionsChange, fieldConfig }) => {
  const styles = useStyles2(getStyles);
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [ephemeralPrompt, setEphemeralPrompt] = useState(options.prompt || DEFAULT_PROMPT);
  const [serverDefault, setServerDefault] = useState<ServerDefault | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDataRef = useRef(data);

  // Fetch server default provider config on mount
  useEffect(() => {
    getBackendSrv()
      .get(`/api/plugins/${PLUGIN_ID}/resources/providers`)
      .then((res: any) => {
        if (res.serverDefault?.provider) {
          setServerDefault(res.serverDefault);
        }
      })
      .catch(() => {});
  }, []);

  // Sync ephemeral prompt when saved prompt changes externally
  useEffect(() => {
    setEphemeralPrompt(options.prompt || DEFAULT_PROMPT);
  }, [options.prompt]);

  const runAnalysis = useCallback(async () => {
    if (!data.series || data.series.length === 0) {
      setError('No data available. Ensure the panel has a configured datasource with query results.');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysis('');

    try {
      const queryResults = serializeDataFrames(data.series);
      const panelJson = extractPanelConfig(data);
      const rawTargets = extractRawTargets(data);
      const resolvedVariables = extractResolvedVariables();

      const prompt = ephemeralPrompt || DEFAULT_PROMPT;

      const request: AnalyzeRequest = {
        panelJson,
        rawTargets,
        resolvedVariables,
        queryResults,
        prompt,
        llm: {
          provider: options.llm?.provider ?? '',
          endpoint: options.llm?.endpoint ?? '',
          model: options.llm?.model ?? '',
          apiKey: options.llm?.apiKey ?? '',
        },
      };

      const response = await getBackendSrv().post<AnalyzeResponse>(
        `/api/plugins/${PLUGIN_ID}/resources/analyze`,
        request
      );

      setAnalysis(response.analysis);
    } catch (err: any) {
      const message = err?.data?.message || err?.message || 'Analysis failed. Check backend logs.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [data, ephemeralPrompt, options.llm]);

  // Auto-analyze on data change (debounced)
  useEffect(() => {
    if (!options.autoAnalyze) {
      return;
    }
    if (data === prevDataRef.current) {
      return;
    }
    prevDataRef.current = data;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      runAnalysis();
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [data, options.autoAnalyze, runAnalysis]);

  const handleSaveAsDefault = useCallback(
    (prompt: string) => {
      onOptionsChange({ ...options, prompt });
    },
    [options, onOptionsChange]
  );

  // If mode is 'ask', render the chat panel instead
  if (options.mode === 'ask') {
    return <ChatPanel options={options} width={width} height={height} />;
  }

  return (
    <div className={styles.wrapper} style={{ width, height }}>
      <div className={styles.controls}>
        <PromptEditor
          savedPrompt={options.prompt || DEFAULT_PROMPT}
          currentPrompt={ephemeralPrompt}
          onPromptChange={setEphemeralPrompt}
          onSaveAsDefault={handleSaveAsDefault}
        />
        {!options.llm?.provider && serverDefault && (
          <div className={styles.providerStatus}>
            Using server default: <strong>{serverDefault.provider}</strong> — {serverDefault.model} ({serverDefault.endpoint})
          </div>
        )}
        <button
          className={styles.analyzeButton}
          onClick={runAnalysis}
          disabled={loading || !data.series?.length}
        >
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>
      <div className={styles.resultArea}>
        {loading && (
          <div className={styles.spinnerContainer}>
            <Spinner size="xl" />
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        {analysis && !loading && <AnalysisResult analysis={analysis} />}
        {!analysis && !loading && !error && (
          <div className={styles.noData}>
            Click &quot;Analyze&quot; to run AI analysis on this panel&apos;s data.
          </div>
        )}
      </div>
    </div>
  );
};
