import { PanelData } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { TemplateVariableInfo } from '../types';

/**
 * Extract panel configuration metadata from PanelData.
 * Returns raw query targets (with $variable placeholders) and time range.
 */
export function extractPanelConfig(data: PanelData): Record<string, unknown> {
  const request = data.request;

  return {
    targets: request?.targets ?? [],
    timeRange: {
      from: request?.range?.from?.toISOString() ?? '',
      to: request?.range?.to?.toISOString() ?? '',
      raw: request?.range?.raw ?? {},
    },
    interval: request?.interval ?? '',
    maxDataPoints: request?.maxDataPoints ?? 0,
  };
}

/**
 * Extract raw query targets from PanelData.
 * These contain $variable placeholders as authored by the dashboard creator.
 */
export function extractRawTargets(data: PanelData): Record<string, unknown>[] {
  const targets = data.request?.targets;
  if (!targets || targets.length === 0) {
    return [];
  }
  return targets.map((t) => ({ ...t } as Record<string, unknown>));
}

/**
 * Get the current resolved values of all dashboard template variables.
 */
export function extractResolvedVariables(): TemplateVariableInfo[] {
  try {
    const templateSrv = getTemplateSrv();
    const variables = (templateSrv as any).getVariables?.() ?? [];

    return variables.map((v: any) => ({
      name: v.name ?? '',
      label: v.label || undefined,
      current: typeof v.current?.value === 'string'
        ? v.current.value
        : Array.isArray(v.current?.value)
          ? v.current.value.join(', ')
          : String(v.current?.text ?? ''),
      type: v.type ?? 'unknown',
    }));
  } catch {
    return [];
  }
}
