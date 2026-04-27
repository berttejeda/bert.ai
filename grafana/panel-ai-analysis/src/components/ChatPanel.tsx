import React, { useState, useCallback, useRef, useEffect } from 'react';
import { css } from '@emotion/css';
import { useStyles2, Spinner } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { PanelAIOptions, AskRequest, AskResponse, ChatMessage as ChatMessageType, DashboardContextPayload } from '../types';
import { PLUGIN_ID } from '../constants';
import { ChatMessageComponent } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';
import { fetchDashboardContext } from '../utils/dashboardContext';

interface Props {
  options: PanelAIOptions;
  width: number;
  height: number;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  `,
  messagesArea: css`
    flex: 1;
    overflow-y: auto;
    padding: ${theme.spacing(1)};
    min-height: 0;
  `,
  inputArea: css`
    flex-shrink: 0;
    display: flex;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1)};
    border-top: 1px solid ${theme.colors.border.weak};
    background: ${theme.colors.background.primary};
  `,
  input: css`
    flex: 1;
    padding: ${theme.spacing(1)};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.background.secondary};
    color: ${theme.colors.text.primary};
    font-size: ${theme.typography.body.fontSize};
    font-family: inherit;
    resize: none;
    outline: none;
    &:focus {
      border-color: ${theme.colors.primary.border};
    }
    &::placeholder {
      color: ${theme.colors.text.disabled};
    }
  `,
  sendButton: css`
    padding: ${theme.spacing(1, 2)};
    background: ${theme.colors.primary.main};
    color: ${theme.colors.primary.contrastText};
    border: none;
    border-radius: ${theme.shape.radius.default};
    cursor: pointer;
    font-size: ${theme.typography.body.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    white-space: nowrap;
    &:hover { background: ${theme.colors.primary.shade}; }
    &:disabled { opacity: 0.6; cursor: not-allowed; }
  `,
  loadingRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1)};
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  error: css`
    color: ${theme.colors.error.text};
    background: ${theme.colors.error.transparent};
    border: 1px solid ${theme.colors.error.border};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1)};
    margin: ${theme.spacing(1)};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  clearBtn: css`
    cursor: pointer;
    background: none;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(0.5, 1)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    &:hover {
      background: ${theme.colors.action.hover};
      color: ${theme.colors.text.primary};
    }
  `,
  header: css`
    display: flex;
    justify-content: flex-end;
    padding: ${theme.spacing(0.5, 1)};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
});

let msgIdCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++msgIdCounter}`;
}

export const ChatPanel: React.FC<Props> = ({ options, width, height }) => {
  const styles = useStyles2(getStyles);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dashboardCtx, setDashboardCtx] = useState<DashboardContextPayload | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch dashboard context once on mount
  useEffect(() => {
    fetchDashboardContext().then((ctx) => {
      if (ctx) {
        setDashboardCtx(ctx);
      }
    });
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || loading) {
      return;
    }

    const userMsg: ChatMessageType = {
      id: nextId(),
      role: 'user',
      content: question.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const request: AskRequest = {
        question: question.trim(),
        llm: {
          provider: options.llm?.provider ?? '',
          endpoint: options.llm?.endpoint ?? '',
          model: options.llm?.model ?? '',
          apiKey: options.llm?.apiKey ?? '',
        },
      };

      // Include InfluxDB config if provided in panel options
      if (options.influxdb?.url) {
        request.influxdb = {
          url: options.influxdb.url,
          token: options.influxdb.token ?? '',
          org: options.influxdb.org ?? '',
          bucket: options.influxdb.bucket ?? '',
          timeout: options.influxdb.timeout || undefined,
        };
      }

      // Include dashboard context so the LLM knows the dashboard's intent
      if (dashboardCtx) {
        request.dashboardContext = dashboardCtx;
      }

      const response = await getBackendSrv().post<AskResponse>(
        `/api/plugins/${PLUGIN_ID}/resources/ask`,
        request
      );

      const assistantMsg: ChatMessageType = {
        id: nextId(),
        role: 'assistant',
        content: response.answer,
        fluxQuery: response.fluxQuery,
        rowCount: response.rowCount,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const message = err?.data?.message || err?.message || 'Failed to get answer. Check backend logs.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loading, options.llm, options.influxdb]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  }, [input, sendQuestion]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setError('');
  }, []);

  return (
    <div className={styles.wrapper} style={{ width, height }}>
      {messages.length > 0 && (
        <div className={styles.header}>
          <button className={styles.clearBtn} onClick={handleClear}>
            Clear chat
          </button>
        </div>
      )}
      <div className={styles.messagesArea}>
        {messages.length === 0 && !loading && (
          <SuggestedQuestions onSelect={sendQuestion} disabled={loading} />
        )}
        {messages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} />
        ))}
        {loading && (
          <div className={styles.loadingRow}>
            <Spinner size="sm" /> Thinking...
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        <div ref={messagesEndRef} />
      </div>
      <div className={styles.inputArea}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your stock data..."
          rows={1}
          disabled={loading}
        />
        <button
          className={styles.sendButton}
          onClick={() => sendQuestion(input)}
          disabled={loading || !input.trim()}
        >
          Ask
        </button>
      </div>
    </div>
  );
};
