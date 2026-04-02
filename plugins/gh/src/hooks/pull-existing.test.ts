import { describe, test, expect } from 'bun:test';
import { buildPullResult } from './pull-existing';

describe('buildPullResult', () => {
  test('formats summary with count', () => {
    const result = buildPullResult({ pulled: 3, warnings: [] });
    expect(result.status).toBe('ok');
    expect(result.summary).toContain('3');
  });

  test('includes warnings in output', () => {
    const result = buildPullResult({ pulled: 1, warnings: ['Issue #5: not found'] });
    expect(result.warnings).toEqual(['Issue #5: not found']);
  });

  test('formats empty pull', () => {
    const result = buildPullResult({ pulled: 0, warnings: [] });
    expect(result.status).toBe('ok');
    expect(result.summary).toContain('0');
  });
});
