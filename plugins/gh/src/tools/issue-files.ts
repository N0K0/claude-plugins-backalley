import { stringify, parse } from 'yaml';

/** Frontmatter fields stored in issue markdown files */
export interface IssueFrontmatter {
  number: number;
  title: string;
  state: string;
  labels: string[];
  milestone: number | null;
  assignees: string[];
  url: string;
  pulled_at: string;
}

/** Result of parsing an issue markdown file */
export interface ParsedIssueFile {
  frontmatter: IssueFrontmatter;
  body: string;
}

/** Build the file path for an issue in a directory */
export function issueFilePath(dir: string, number: number): string {
  return `${dir}/issue-${number}.md`;
}

/**
 * Serialize a raw GitHub API issue object into markdown with YAML frontmatter.
 * Takes the raw API response (pre-slim) and extracts fields internally.
 */
export function serializeIssue(raw: any): string {
  const frontmatter: IssueFrontmatter = {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    labels: (raw.labels ?? []).map((l: any) => l.name ?? l),
    milestone: raw.milestone?.number ?? null,
    assignees: (raw.assignees ?? []).map((a: any) => a.login ?? a),
    url: raw.html_url,
    pulled_at: new Date().toISOString(),
  };

  const yamlStr = stringify(frontmatter, { lineWidth: 0 });
  const body = raw.body ?? '';
  return `---\n${yamlStr}---\n\n${body}\n`;
}

/**
 * Parse a markdown file with YAML frontmatter into structured data.
 * Expects `---` delimiters around the YAML block.
 */
export function parseIssueFile(content: string): ParsedIssueFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid issue file: missing YAML frontmatter delimiters');
  }

  const frontmatter = parse(match[1]) as IssueFrontmatter;
  if (!frontmatter.number) {
    throw new Error('Invalid issue file: missing "number" in frontmatter');
  }

  // Trim trailing newline added by serializeIssue
  const body = match[2].replace(/\n$/, '');

  return { frontmatter, body };
}
