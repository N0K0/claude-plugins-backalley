import { spawn } from 'bun';

export interface GhOptions {
  owner?: string;
  repo?: string;
}

export interface GhContext {
  owner: string;
  repo: string;
}

export interface GhError {
  message: string;
  status?: number;
}

/**
 * Detect current repo from gh CLI.
 * @param cwd — directory to detect repo from (must be inside a git repo with a GitHub remote)
 */
export async function detectRepo(cwd?: string): Promise<GhContext> {
  const result = await exec(['repo', 'view', '--json', 'owner,name'], undefined, cwd);
  const owner = result.owner?.login;
  if (!owner) throw new Error('Could not detect repo owner. Are you in a git repo with a GitHub remote?');
  return { owner, repo: result.name };
}

/**
 * Check that gh is installed and authenticated.
 */
export async function checkGh(): Promise<void> {
  try {
    await execRaw(['--version']);
  } catch {
    throw new Error(
      'gh CLI is not installed. Install it: https://cli.github.com/'
    );
  }
  try {
    await execRaw(['auth', 'status']);
  } catch {
    throw new Error(
      'gh CLI is not authenticated. Run: gh auth login'
    );
  }
}

/**
 * Call gh api (REST). Returns parsed JSON.
 */
export async function api(
  endpoint: string,
  opts: {
    method?: string;
    fields?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {}
): Promise<any> {
  const args = ['api', endpoint];

  // gh api defaults to POST when -f fields are present.
  // For read operations (no explicit method, no body), force GET.
  const method = opts.method ?? (opts.fields && !opts.body ? 'GET' : undefined);
  if (method) {
    args.push('--method', method);
  }

  if (opts.fields) {
    for (const [key, value] of Object.entries(opts.fields)) {
      args.push('-f', `${key}=${value}`);
    }
  }

  if (opts.body) {
    args.push('--input', '-');
  }

  return exec(args, opts.body ? JSON.stringify(opts.body) : undefined);
}

/**
 * Fetch all comments for an issue, paginated.
 */
export async function fetchAllComments(owner: string, repo: string, issueNumber: number): Promise<any[]> {
  const comments: any[] = [];
  let page = 1;
  while (true) {
    const batch = await api(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      fields: { per_page: '100', page: String(page) },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    comments.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return comments;
}

/**
 * Resolve repo context: use provided owner/repo or fall back to defaults.
 */
export function resolveRepo(
  defaults: GhContext | null,
  opts?: GhOptions
): GhContext {
  const owner = opts?.owner ?? defaults?.owner;
  const repo = opts?.repo ?? defaults?.repo;
  if (!owner || !repo) {
    throw new Error('No repository context set. Either pass owner/repo parameters, or call detect_repo with the project path first.');
  }
  return { owner, repo };
}

// --- Internal helpers ---

async function exec(args: string[], stdin?: string, cwd?: string): Promise<any> {
  const output = await execRaw(args, stdin, cwd);
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

async function execRaw(args: string[], stdin?: string, cwd?: string): Promise<string> {
  const proc = spawn(['gh', ...args], {
    stdin: stdin ? new Blob([stdin]) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    ...(cwd ? { cwd } : {}),
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    let message = stderr.trim() || stdout.trim() || `gh exited with code ${exitCode}`;
    // Try to parse GitHub API error
    try {
      const parsed = JSON.parse(stderr || stdout);
      if (parsed.message) message = parsed.message;
    } catch {}
    throw new Error(message);
  }

  return stdout;
}
