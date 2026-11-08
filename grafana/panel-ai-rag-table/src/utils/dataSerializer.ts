import { DataFrame, FieldType } from '@grafana/data';

import { SerializedDataFrame, SerializedField } from '../types';

const MAX_POINTS = 500;
const SAMPLE_HEAD = 50;
const SAMPLE_TAIL = 50;

/**
 * Converts Grafana DataFrames into JSON-serializable form for the backend.
 * Large frames are sampled to head + tail to stay within prompt limits.
 */
export function serializeDataFrames(frames: DataFrame[]): SerializedDataFrame[] {
  return frames.map((frame) => {
    const length = frame.length;
    const sampled = length > MAX_POINTS;
    const indices = sampled ? buildSampleIndices(length) : null;
    const effectiveLength = indices ? indices.length : length;

    const fields: SerializedField[] = frame.fields.map((field) => {
      const values = indices
        ? indices.map((i) => field.values[i])
        : Array.from({ length }, (_, i) => field.values[i]);

      return {
        name: field.name,
        type: FieldType[field.type] ?? 'other',
        values,
        labels: field.labels,
      };
    });

    return {
      name: frame.name ?? frame.refId ?? 'frame',
      fields,
      length: effectiveLength,
      sampled,
      originalLength: sampled ? length : undefined,
    };
  });
}

function buildSampleIndices(length: number): number[] {
  const head = Array.from({ length: SAMPLE_HEAD }, (_, i) => i);
  const tail = Array.from({ length: SAMPLE_TAIL }, (_, i) => length - SAMPLE_TAIL + i);
  const seen = new Set<number>();
  const result: number[] = [];
  for (const i of [...head, ...tail]) {
    if (!seen.has(i) && i >= 0 && i < length) {
      seen.add(i);
      result.push(i);
    }
  }
  return result.sort((a, b) => a - b);
}
