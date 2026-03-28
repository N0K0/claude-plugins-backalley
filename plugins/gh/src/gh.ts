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
 * Called once at startup, cached for the session.
 */
export async function detectRepo(): Promise<GhContext> {
  const result = await exec(['repo', 'view', '--json', 'owner,name']);
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

  if (opts.method) {
    args.push('--method', opts.method);
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
 * Call gh api graphql. Returns parsed JSON data field.
 */
export async function graphql(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<any> {
  const args = ['api', 'graphql'];
  args.push('-f', `query=${query}`);

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      args.push('-F', `${key}=${value}`);
    } else {
      args.push('-f', `${key}=${String(value)}`);
    }
  }

  const result = await exec(args);
  if (result.errors?.length) {
    throw new Error(result.errors.map((e: any) => e.message).join('; '));
  }
  return result.data;
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
    throw new Error('No repo detected. Provide owner and repo parameters explicitly.');
  }
  return { owner, repo };
}

// --- Internal helpers ---

async function exec(args: string[], stdin?: string): Promise<any> {
  const output = await execRaw(args, stdin);
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

async function execRaw(args: string[], stdin?: string): Promise<string> {
  const proc = spawn(['gh', ...args], {
    stdin: stdin ? new Blob([stdin]) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
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
