import React, { useRef, useState } from 'react';
import { PanelProps } from '@grafana/data';
import { SimpleOptions } from 'types';
import { css, cx } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';
import { getBackendSrv } from '@grafana/runtime';
import html2canvas from 'html2canvas';

interface Props extends PanelProps<SimpleOptions> {}

const getStyles = () => {
  return {
    wrapper: css`
      font-family: Open Sans, Helvetica, Arial, sans-serif;
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    `,
    panelContent: css`
      flex-grow: 1;
      padding: 10px;
    `,
    analysisBox: css`
      white-space: pre-wrap;
      color: #00ff00;
      padding: 10px;
      margin-top: 10px;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1.5;
    `,
    screenshotButton: css`
      margin: 10px;
    `,
  };
};

export const SimplePanel: React.FC<Props> = ({ options, data, width, height }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const styles = useStyles2(getStyles);

  const handleScreenshot = async () => {
    setIsLoading(true);
    setAnalysis('');

    try {
      // Find the dashboard container - try multiple selectors to find the main dashboard view
      const dashboardContainer =
        document.querySelector('.react-grid-layout') || // Dashboard grid
        document.querySelector('[data-testid="dashboard-scene-page"]') || // New dashboard scene
        document.querySelector('.dashboard-container') || // Legacy dashboard
        document.querySelector('main') || // Fallback to main content
        document.body; // Last resort fallback

      if (!dashboardContainer) {
        setAnalysis('Could not find dashboard container');
        setIsLoading(false);
        return;
      }

      // Capture the entire dashboard
      const canvas = await html2canvas(dashboardContainer as HTMLElement, {
        backgroundColor: '#1e1e1e',
        scale: 1, // Adjust quality (higher = better quality but larger file)
        logging: false,
        useCORS: true,
      });
      const imageData = canvas.toDataURL('image/png');

      // For panel plugins with backends, use the plugin ID in the API path
      const pluginId = 'open-llmengineer2-panel';
      const url = `/api/plugins/${pluginId}/resources/screenshot`;

      const result = await getBackendSrv().post(url, {
        imageData,
      });

      setAnalysis(result.analysis);
    } catch (error) {
      console.error('Failed to send screenshot', error);
      setAnalysis('Failed to get analysis. See console for details.');
    }
    setIsLoading(false);
  };

  return (
    <div className={cx(styles.wrapper)} ref={panelRef}>
      <div className={styles.panelContent}>
        Click the button to get an AI analysis of the entire dashboard.
        {isLoading && <div>Capturing dashboard and analyzing...</div>}
        {analysis && (
          <div className={styles.analysisBox}>
            {analysis}
          </div>
        )}
      </div>
      <button className={styles.screenshotButton} onClick={handleScreenshot} disabled={isLoading}>Analyze Dashboard</button>
    </div>
  );
};