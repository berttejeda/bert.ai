import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';

interface AnalysisResultProps {
  analysis: string;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(2)};
    overflow-y: auto;
    max-height: 100%;
    position: relative;
  `,
  copyButton: css`
    position: absolute;
    top: ${theme.spacing(1)};
    right: ${theme.spacing(1)};
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(0.5, 1)};
    cursor: pointer;
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.secondary};
    &:hover {
      background: ${theme.colors.action.hover};
      color: ${theme.colors.text.primary};
    }
  `,
  markdown: css`
    font-size: ${theme.typography.body.fontSize};
    line-height: ${theme.typography.body.lineHeight};
    color: ${theme.colors.text.primary};

    h1, h2, h3, h4, h5, h6 {
      margin-top: ${theme.spacing(2)};
      margin-bottom: ${theme.spacing(1)};
      color: ${theme.colors.text.maxContrast};
    }

    p {
      margin-bottom: ${theme.spacing(1)};
    }

    ul, ol {
      margin-bottom: ${theme.spacing(1)};
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
      padding: ${theme.spacing(1.5)};
      border-radius: ${theme.shape.radius.default};
      overflow-x: auto;
      margin-bottom: ${theme.spacing(1)};

      code {
        background: none;
        padding: 0;
      }
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: ${theme.spacing(1)};
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
      padding-left: ${theme.spacing(1.5)};
      margin-left: 0;
      color: ${theme.colors.text.secondary};
    }
  `,
});

export const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis }) => {
  const styles = useStyles2(getStyles);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(analysis);
  }, [analysis]);

  return (
    <div className={styles.container}>
      <button className={styles.copyButton} onClick={handleCopy} title="Copy to clipboard">
        Copy
      </button>
      <div className={styles.markdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
      </div>
    </div>
  );
};
