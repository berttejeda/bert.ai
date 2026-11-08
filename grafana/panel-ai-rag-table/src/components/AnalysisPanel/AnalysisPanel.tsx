import { GrafanaTheme2 } from '@grafana/data';
import { Button, Spinner, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { PLUGIN_ID } from '../../constants';
import { ChatMessage, FilteredRow, LLMConfig, ColumnFilter, FilterLogic, SerializedDataFrame, TemplateVariableInfo } from '../../types';

interface Props {
  llm: LLMConfig;
  prompt: string;
  filteredRows: FilteredRow[];
  allFrames: SerializedDataFrame[];
  activeFilters: ColumnFilter[];
  filterLogic: FilterLogic;
  resolvedVariables: TemplateVariableInfo[];
  ragContextRows: number;
  autoAnalyze: boolean;
  /** Height of this panel section */
  height: number;
  /** Triggered when data/filters change and autoAnalyze is on */
  dataVersion: number;
}

const getStyles = (theme: GrafanaTheme2) => ({
  root: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    border-top: 1px solid ${theme.colors.border.medium};
    background: ${theme.colors.background.primary};
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.75, 1)};
    background: ${theme.colors.background.secondary};
    border-bottom: 1px solid ${theme.colors.border.weak};
    flex-shrink: 0;
  `,
  title: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    color: ${theme.colors.text.primary};
    flex: 1;
  `,
  badge: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    background: ${theme.colors.background.canvas};
    padding: ${theme.spacing(0.25, 0.75)};
    border-radius: ${theme.shape.radius.default};
    border: 1px solid ${theme.colors.border.weak};
  `,
  messages: css`
    flex: 1;
    overflow-y: auto;
    padding: ${theme.spacing(1)};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    min-height: 0;
  `,
  message: css`
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1, 1.25)};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: 1.6;
  `,
  userMsg: css`
    background: ${theme.colors.primary.transparent};
    border: 1px solid ${theme.colors.primary.border};
    color: ${theme.colors.text.primary};
    align-self: flex-end;
    max-width: 80%;
  `,
  assistantMsg: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    color: ${theme.colors.text.primary};
    align-self: flex-start;
    width: 100%;
  `,
  error: css`
    background: ${theme.colors.error.transparent};
    border: 1px solid ${theme.colors.error.border};
    color: ${theme.colors.error.text};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1)};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  spinner: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    padding: ${theme.spacing(0.5)};
  `,
  empty: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    text-align: center;
    padding: ${theme.spacing(2)};
  `,
  mdWrapper: css`
    & p { margin: 0 0 0.4em 0; }
    & ul, & ol { margin: 0.2em 0 0.4em 1.2em; }
    & li { margin: 0.1em 0; }
    & code { font-family: monospace; font-size: 0.9em; background: ${theme.colors.background.canvas}; padding: 0.1em 0.3em; border-radius: 3px; }
    & pre { background: ${theme.colors.background.canvas}; padding: 0.5em; border-radius: 4px; overflow-x: auto; }
    & h1, & h2, & h3 { margin: 0.4em 0 0.2em; }
    & strong { font-weight: ${theme.typography.fontWeightMedium}; }
    & table { border-collapse: collapse; width: 100%; }
    & th, & td { border: 1px solid ${theme.colors.border.weak}; padding: 0.25em 0.5em; }
    & th { background: ${theme.colors.background.secondary}; }
  `,
});

export const AnalysisPanel: React.FC<Props> = ({
  llm,
  prompt,
  filteredRows,
  allFrames,
  activeFilters,
  filterLogic,
  resolvedVariables,
  ragContextRows,
  autoAnalyze,
  height,
  dataVersion,
}) => {
  const styles = useStyles2(getStyles);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const prevVersionRef = useRef(dataVersion);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');

    const contextRows = filteredRows.slice(0, ragContextRows);

    try {
      const response = await fetch(`/api/plugins/${PLUGIN_ID}/resources/rag-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryResults: allFrames,
          filteredRows: contextRows,
          activeFilters,
          filterLogic,
          prompt,
          llm,
          resolvedVariables,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? `Request failed: ${response.status}`);
      }

      const assistant: ChatMessage = {
        id: String(Date.now()),
        role: 'assistant',
        content: data.analysis,
        timestamp: Date.now(),
        contextRows: data.contextRows,
        totalFilteredRows: data.totalFilteredRows,
      };

      setMessages((prev) => [...prev, assistant]);
    } catch (err: any) {
      setError(err?.message ?? 'Analysis failed. Check backend logs.');
    } finally {
      setLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [allFrames, filteredRows, activeFilters, filterLogic, prompt, llm, resolvedVariables, ragContextRows]);

  useEffect(() => {
    if (!autoAnalyze) {
      return;
    }
    if (dataVersion === prevVersionRef.current) {
      return;
    }
    prevVersionRef.current = dataVersion;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(runAnalysis, 1200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [dataVersion, autoAnalyze, runAnalysis]);

  return (
    <div className={styles.root} style={{ height }}>
      <div className={styles.toolbar}>
        <span className={styles.title}>AI Analysis</span>
        {activeFilters.length > 0 && (
          <span className={styles.badge}>
            {activeFilters.length} filter{activeFilters.length > 1 ? 's' : ''} active · {filteredRows.length} rows
          </span>
        )}
        <Button
          size="sm"
          variant="primary"
          icon="sync"
          onClick={runAnalysis}
          disabled={loading || allFrames.length === 0}
        >
          Analyze
        </Button>
        {messages.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setMessages([])}>
            Clear
          </Button>
        )}
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && !loading && !error && (
          <div className={styles.empty}>
            Click &ldquo;Analyze&rdquo; to run RAG analysis on the filtered table data.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.message} ${msg.role === 'user' ? styles.userMsg : styles.assistantMsg}`}
          >
            {msg.role === 'assistant' ? (
              <div className={styles.mdWrapper}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                {msg.contextRows !== undefined && (
                  <small style={{ opacity: 0.6 }}>
                    &nbsp;({msg.contextRows} rows in context, {msg.totalFilteredRows} filtered)
                  </small>
                )}
              </div>
            ) : (
              msg.content
            )}
          </div>
        ))}

        {loading && (
          <div className={styles.spinner}>
            <Spinner size="sm" />
            Analyzing…
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
