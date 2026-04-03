import { describe, test, expect } from 'bun:test';
import { searchIssues } from './issue-search';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const tmpDir = join(import.meta.dir, '__test_tmp_search');

function issueFile(opts: {
  number: number; title: string; state: string;
  labels?: string[]; milestone?: number | null; assignees?: string[];
}) {
  const labels = (opts.labels ?? []).map(l => `  - ${l}`).join('\n');
  return `---
number: ${opts.number}
title: "${opts.title}"
state: ${opts.state}
labels:
${labels || '  []'}
milestone: ${opts.milestone ?? 'null'}
assignees:
${(opts.assignees ?? []).map(a => `  - ${a}`).join('\n') || '  []'}
---

Body of issue ${opts.number}.`;
}

describe('searchIssues', () => {
  test('filters by state (default open)', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'Open', state: 'open' }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'Closed', state: 'closed' }));

    const results = await searchIssues(tmpDir, {});
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);

    await rm(tmpDir, { recursive: true });
  });

  test('filters by labels (AND logic)', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'A', state: 'open', labels: ['bug', 'backlog'] }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'B', state: 'open', labels: ['bug'] }));

    const results = await searchIssues(tmpDir, { labels: 'bug,backlog' });
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);

    await rm(tmpDir, { recursive: true });
  });

  test('filters by milestone', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'A', state: 'open', milestone: 3 }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'B', state: 'open', milestone: null }));

    const withMilestone = await searchIssues(tmpDir, { milestone: '3' });
    expect(withMilestone).toHaveLength(1);
    expect(withMilestone[0].number).toBe(1);

    const noMilestone = await searchIssues(tmpDir, { milestone: 'none' });
    expect(noMilestone).toHaveLength(1);
    expect(noMilestone[0].number).toBe(2);

    await rm(tmpDir, { recursive: true });
  });

  test('filters by assignee', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'A', state: 'open', assignees: ['alice'] }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'B', state: 'open', assignees: [] }));

    const assigned = await searchIssues(tmpDir, { assignee: 'alice' });
    expect(assigned).toHaveLength(1);
    expect(assigned[0].number).toBe(1);

    const none = await searchIssues(tmpDir, { assignee: 'none' });
    expect(none).toHaveLength(1);
    expect(none[0].number).toBe(2);

    await rm(tmpDir, { recursive: true });
  });

  test('state=all returns everything', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'Open', state: 'open' }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'Closed', state: 'closed' }));

    const results = await searchIssues(tmpDir, { state: 'all' });
    expect(results).toHaveLength(2);

    await rm(tmpDir, { recursive: true });
  });
});
