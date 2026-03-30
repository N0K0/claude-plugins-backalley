import type { GhContext } from './gh.js';

let defaultRepo: GhContext | null = null;

export function getDefaultRepo(): GhContext | null {
  return defaultRepo;
}

export function setDefaultRepo(ctx: GhContext): void {
  defaultRepo = ctx;
}
