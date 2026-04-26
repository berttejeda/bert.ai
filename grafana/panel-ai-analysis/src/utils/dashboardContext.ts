import { getBackendSrv } from '@grafana/runtime';

/**
 * Summary of a single panel's query for LLM context.
 */
export interface DashboardPanelSummary {
  id: number;
  title: string;
  type: string;
  queries: string[];
}

/**
 * Compact representation of the dashboard sent to the backend.
 */
export interface DashboardContext {
  title: string;
  description: string;
  panels: DashboardPanelSummary[];
}

/**
 * Extract the dashboard UID from the current URL.
 * Grafana URLs follow /d/:uid/:slug or /d/:uid
 */
function getDashboardUidFromUrl(): string | null {
  const match = window.location.pathname.match(/\/d\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Recursively extract panels, including those nested inside collapsed rows.
 */
function flattenPanels(panels: any[]): DashboardPanelSummary[] {
  const result: DashboardPanelSummary[] = [];

  for (const panel of panels) {
    // Row panels can have nested panels
    if (panel.type === 'row' && Array.isArray(panel.panels) && panel.panels.length > 0) {
      result.push(...flattenPanels(panel.panels));
      continue;
    }

    // Skip rows without queries
    if (panel.type === 'row') {
      continue;
    }

    const queries: string[] = [];
    if (Array.isArray(panel.targets)) {
      for (const target of panel.targets) {
        if (target.query && typeof target.query === 'string') {
          queries.push(target.query);
        }
      }
    }

    // Only include panels that have actual queries
    if (queries.length > 0) {
      result.push({
        id: panel.id,
        title: panel.title || '(untitled)',
        type: panel.type || 'unknown',
        queries,
      });
    }
  }

  return result;
}

/**
 * Fetch the current dashboard model and extract a compact context
 * summary including all panel titles and their Flux queries.
 */
export async function fetchDashboardContext(): Promise<DashboardContext | null> {
  const uid = getDashboardUidFromUrl();
  if (!uid) {
    return null;
  }

  try {
    const response = await getBackendSrv().get(`/api/dashboards/uid/${uid}`);
    const dashboard = response?.dashboard;
    if (!dashboard) {
      return null;
    }

    const panels = flattenPanels(dashboard.panels || []);

    return {
      title: dashboard.title || '',
      description: dashboard.description || '',
      panels,
    };
  } catch (err) {
    // Silently fail — dashboard context is supplementary
    console.warn('Failed to fetch dashboard context for AI:', err);
    return null;
  }
}
