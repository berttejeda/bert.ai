import React, { useState, useCallback } from 'react';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';

interface PromptEditorProps {
  savedPrompt: string;
  currentPrompt: string;
  onPromptChange: (prompt: string) => void;
  onSaveAsDefault: (prompt: string) => void;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    margin-bottom: ${theme.spacing(1)};
  `,
  toggleButton: css`
    background: none;
    border: none;
    color: ${theme.colors.text.secondary};
    cursor: pointer;
    padding: ${theme.spacing(0.5, 0)};
    font-size: ${theme.typography.bodySmall.fontSize};
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    &:hover {
      color: ${theme.colors.text.primary};
    }
  `,
  editorPanel: css`
    margin-top: ${theme.spacing(0.5)};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
  `,
  textarea: css`
    width: 100%;
    min-height: 100px;
    padding: ${theme.spacing(1)};
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.primary};
    border: none;
    resize: vertical;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: 1.5;
    &:focus {
      outline: none;
      box-shadow: inset 0 0 0 1px ${theme.colors.primary.border};
    }
  `,
  buttonBar: css`
    display: flex;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5, 1)};
    background: ${theme.colors.background.secondary};
    border-top: 1px solid ${theme.colors.border.weak};
  `,
  button: css`
    padding: ${theme.spacing(0.5, 1)};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.secondary};
    cursor: pointer;
    font-size: ${theme.typography.bodySmall.fontSize};
    &:hover {
      background: ${theme.colors.action.hover};
      color: ${theme.colors.text.primary};
    }
  `,
  dirty: css`
    color: ${theme.colors.warning.text};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-left: auto;
    display: flex;
    align-items: center;
  `,
});

export const PromptEditor: React.FC<PromptEditorProps> = ({
  savedPrompt,
  currentPrompt,
  onPromptChange,
  onSaveAsDefault,
}) => {
  const styles = useStyles2(getStyles);
  const [expanded, setExpanded] = useState(false);

  const isDirty = currentPrompt !== savedPrompt;

  const handleReset = useCallback(() => {
    onPromptChange(savedPrompt);
  }, [savedPrompt, onPromptChange]);

  const handleSave = useCallback(() => {
    onSaveAsDefault(currentPrompt);
  }, [currentPrompt, onSaveAsDefault]);

  return (
    <div className={styles.container}>
      <button
        className={styles.toggleButton}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▼' : '▶'} Prompt {isDirty && '(modified)'}
      </button>
      {expanded && (
        <div className={styles.editorPanel}>
          <textarea
            className={styles.textarea}
            value={currentPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Enter custom prompt..."
          />
          <div className={styles.buttonBar}>
            <button className={styles.button} onClick={handleReset} title="Reset to saved prompt">
              Reset to saved
            </button>
            <button className={styles.button} onClick={handleSave} title="Save as panel default">
              Save as default
            </button>
            {isDirty && <span className={styles.dirty}>unsaved changes</span>}
          </div>
        </div>
      )}
    </div>
  );
};
