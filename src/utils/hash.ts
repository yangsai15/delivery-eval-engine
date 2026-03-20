import { createHash } from 'crypto';

/**
 * Generate a SHA-256 hash of the given object for change detection.
 */
export function hashParams(params: unknown): string {
  const json = JSON.stringify(params, Object.keys(params as object).sort());
  return createHash('sha256').update(json).digest('hex');
}
