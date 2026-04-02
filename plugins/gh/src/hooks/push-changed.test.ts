import { describe, test, expect } from 'bun:test';
import { buildPushResult, isRemoteNewer } from './push-changed';

describe('buildPushResult', () => {
  test('formats summary with all counts', () => {
    const result = buildPushResult({ pushed: 2, created: 1, skipped: ['#42 (remote newer)'] });
    expect(result.status).toBe('ok');
    expect(result.summary).toContain('2');
    expect(result.summary).toContain('1');
    expect(result.summary).toContain('#42');
  });

  test('omits zero counts from summary', () => {
    const result = buildPushResult({ pushed: 1, created: 0, skipped: [] });
    expect(result.status).toBe('ok');
    expect(result.warnings).toBeUndefined();
  });
});

describe('isRemoteNewer', () => {
  test('returns true when remote updated after pulled_at', () => {
    expect(isRemoteNewer('2026-04-01T12:00:00Z', '2026-04-01T10:00:00Z')).toBe(true);
  });

  test('returns false when remote updated before pulled_at', () => {
    expect(isRemoteNewer('2026-04-01T08:00:00Z', '2026-04-01T10:00:00Z')).toBe(false);
  });

  test('returns true when pulled_at is undefined (no baseline)', () => {
    expect(isRemoteNewer('2026-04-01T12:00:00Z', undefined)).toBe(true);
  });
});
