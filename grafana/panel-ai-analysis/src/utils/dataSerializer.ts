import { DataFrame } from '@grafana/data';
import { SerializedDataFrame, SerializedField } from '../types';
import { MAX_DATA_POINTS, SAMPLE_HEAD, SAMPLE_TAIL } from '../constants';

/**
 * Sample an array by keeping the first SAMPLE_HEAD, last SAMPLE_TAIL,
 * and evenly-spaced points in between.
 */
function sampleValues(values: unknown[], maxPoints: number, head: number, tail: number): unknown[] {
  const len = values.length;
  if (len <= maxPoints) {
    return values;
  }

  const headSlice = values.slice(0, head);
  const tailSlice = values.slice(len - tail);
  const middleCount = maxPoints - head - tail;
  const middleSlice: unknown[] = [];

  if (middleCount > 0) {
    const middleStart = head;
    const middleEnd = len - tail;
    const step = (middleEnd - middleStart) / (middleCount + 1);
    for (let i = 1; i <= middleCount; i++) {
      middleSlice.push(values[Math.round(middleStart + step * i)]);
    }
  }

  return [...headSlice, ...middleSlice, ...tailSlice];
}

/**
 * Serialize a Grafana DataFrame[] into a compact JSON-serializable format.
 * Large datasets are sampled down to avoid exceeding LLM context limits.
 */
export function serializeDataFrames(frames: DataFrame[]): SerializedDataFrame[] {
  return frames.map((frame) => {
    const originalLength = frame.length;
    const needsSampling = originalLength > MAX_DATA_POINTS;

    const fields: SerializedField[] = frame.fields.map((field) => {
      const rawValues = field.values;
      const values = needsSampling
        ? sampleValues(Array.from(rawValues), MAX_DATA_POINTS, SAMPLE_HEAD, SAMPLE_TAIL)
        : Array.from(rawValues);

      const serialized: SerializedField = {
        name: field.name,
        type: field.type,
        values,
      };

      if (field.labels && Object.keys(field.labels).length > 0) {
        serialized.labels = field.labels;
      }

      return serialized;
    });

    const result: SerializedDataFrame = {
      name: frame.name || frame.refId || 'unknown',
      fields,
      length: needsSampling ? MAX_DATA_POINTS : originalLength,
    };

    if (needsSampling) {
      result.sampled = true;
      result.originalLength = originalLength;
    }

    return result;
  });
}
