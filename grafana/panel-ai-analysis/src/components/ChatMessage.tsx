import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { ChatMessage as ChatMessageType } from '../types';

interface Props {
  message: ChatMessageType;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    flex-direction: column;
    margin-bottom: ${theme.spacing(1.5)};
  `,
  userBubble: css`
    align-self: flex-end;
    background: ${theme.colors.primary.main};
    color: ${theme.colors.primary.contrastText};
    border-radius: ${theme.shape.radius.default} ${theme.shape.radius.default} 4px ${theme.shape.radius.default};
    padding: ${theme.spacing(1, 1.5)};
    max-width: 85%;
    font-size: ${theme.typography.body.fontSize};
    word-wrap: break-word;
  `,
  assistantBubble: css`
    align-self: flex-start;
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default} ${theme.shape.radius.default} ${theme.shape.radius.default} 4px;
    padding: ${theme.spacing(1.5)};
    max-width: 95%;
    position: relative;
  `,
  markdown: css`
    font-size: ${theme.typography.body.fontSize};
    line-height: ${theme.typography.body.lineHeight};
    color: ${theme.colors.text.primary};

    h1, h2, h3, h4, h5, h6 {
      margin-top: ${theme.spacing(1.5)};
      margin-bottom: ${theme.spacing(0.5)};
      color: ${theme.colors.text.maxContrast};
    }

    p { margin-bottom: ${theme.spacing(0.75)}; }
    p:last-child { margin-bottom: 0; }

    ul, ol {
      margin-bottom: ${theme.spacing(0.75)};
      padding-left: ${theme.spacing(3)};
    }

    code {
      background: ${theme.colors.background.primary};
      padding: ${theme.spacing(0.25, 0.5)};
      border-radius: ${theme.shape.radius.default};
      font-family: ${theme.typography.fontFamilyMonospace};
      font-size: 0.9em;
    }

    pre {
      background: ${theme.colors.background.primary};
      padding: ${theme.spacing(1)};
      border-radius: ${theme.shape.radius.default};
      overflow-x: auto;
      margin-bottom: ${theme.spacing(0.75)};
      code { background: none; padding: 0; }
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: ${theme.spacing(0.75)};
    }

    th, td {
      border: 1px solid ${theme.colors.border.weak};
      padding: ${theme.spacing(0.5, 1)};
      text-align: left;
    }

    th {
      background: ${theme.colors.background.primary};
      font-weight: ${theme.typography.fontWeightMedium};
    }

    blockquote {
      border-left: 3px solid ${theme.colors.border.medium};
      padding-left: ${theme.spacing(1)};
      margin-left: 0;
      color: ${theme.colors.text.secondary};
    }
  `,
  meta: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(0.5)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
  `,
  fluxToggle: css`
    cursor: pointer;
    text-decoration: underline;
    &:hover { color: ${theme.colors.text.primary}; }
  `,
  fluxBlock: css`
    margin-top: ${theme.spacing(0.5)};
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1)};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 0.85em;
    white-space: pre-wrap;
    overflow-x: auto;
  `,
  copyBtn: css`
    cursor: pointer;
    background: none;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(0.25, 0.75)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    &:hover {
      background: ${theme.colors.action.hover};
      color: ${theme.colors.text.primary};
    }
  `,
});

export const ChatMessageComponent: React.FC<Props> = ({ message }) => {
  const styles = useStyles2(getStyles);
  const [showFlux, setShowFlux] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
  }, [message.content]);

  const handleCopyFlux = useCallback(() => {
    if (message.fluxQuery) {
      navigator.clipboard.writeText(message.fluxQuery);
    }
  }, [message.fluxQuery]);

  if (message.role === 'user') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.userBubble}>{message.content}</div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.assistantBubble}>
        <div className={styles.markdown}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        <div className={styles.meta}>
          <button className={styles.copyBtn} onClick={handleCopy} title="Copy answer">
            Copy
          </button>
          {message.fluxQuery && (
            <span className={styles.fluxToggle} onClick={() => setShowFlux(!showFlux)}>
              {showFlux ? 'Hide query' : 'Show query'}
            </span>
          )}
          {message.rowCount !== undefined && message.rowCount > 0 && (
            <span>{message.rowCount} rows</span>
          )}
        </div>
        {showFlux && message.fluxQuery && (
          <div>
            <div className={styles.fluxBlock}>{message.fluxQuery}</div>
            <div className={styles.meta}>
              <button className={styles.copyBtn} onClick={handleCopyFlux} title="Copy Flux query">
                Copy query
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
