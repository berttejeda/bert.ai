import React from 'react';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { SUGGESTED_QUESTIONS } from '../constants';

interface Props {
  onSelect: (question: string) => void;
  disabled?: boolean;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: ${theme.spacing(2)};
    padding: ${theme.spacing(3, 2)};
  `,
  heading: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.body.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  grid: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    justify-content: center;
    max-width: 700px;
  `,
  chip: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: 20px;
    padding: ${theme.spacing(0.75, 1.5)};
    font-size: ${theme.typography.bodySmall.fontSize};
    color: ${theme.colors.text.primary};
    cursor: pointer;
    transition: all 0.15s ease;
    &:hover {
      background: ${theme.colors.action.hover};
      border-color: ${theme.colors.primary.border};
      color: ${theme.colors.primary.text};
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
});

export const SuggestedQuestions: React.FC<Props> = ({ onSelect, disabled }) => {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.container}>
      <div className={styles.heading}>Ask a question about your stock data</div>
      <div className={styles.grid}>
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <button
            key={i}
            className={styles.chip}
            onClick={() => onSelect(q)}
            disabled={disabled}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
};
