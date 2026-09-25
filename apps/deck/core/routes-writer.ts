import { existsSync, readFileSync, writeFileSync } from 'fs';

import { bareName, routesPath } from './discover.ts';

// Rewrite one route's port in routes.json atomically, preserving all other
// fields (pid, etc.). Accepts a bare name or a full <name>.localhost hostname.
// Returns false (no write) when no matching entry exists or the file is unreadable.
export function setRoutePort(hostname: string, port: number): boolean {
  const bare = hostname.replace(/\.localhost$/, '');
  const path = routesPath();
  let routes: Array<Record<string, unknown>>;
  try {
    routes = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
  const entry = routes.find(
    r => String(r.hostname).replace(/\.localhost$/, '') === bare
  );
  if (!entry) return false;
  entry.port = port;
  // MUST be an in-place write. Do NOT "improve" this into the usual atomic
  // temp-file + rename: portless watches this exact path with fs.watch, which
  // follows the inode, so replacing the file leaves the proxy watching a dead
  // inode. Measured behaviour: the rename itself is delivered, then every later
  // change is silently ignored, and .localhost serves stale ports until the
  // proxy is restarted. Writing in place keeps the inode and the watcher alive
  // (verified across repeated writes). routes-writer.test.ts guards this.
  //
  // The cost is losing write atomicity, so readers must tolerate a torn read;
  // readRoutes() falls back to the last good value for that reason.
  writeFileSync(path, JSON.stringify(routes, null, 2));
  return true;
}

/** Append a route for `hostname` if none exists (any-TLD exact match), using
    the same in-place write discipline as setRoutePort -- portless follows the
    inode. Returns true when a route was appended. */
export function ensureRoute(hostname: string, port: number): boolean {
  const path = routesPath();
  let routes: Array<Record<string, unknown>>;
  try {
    routes = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
  if (routes.some(r => String(r.hostname) === hostname)) return false;
  routes.push({ hostname, port, pid: 0 });
  writeFileSync(path, JSON.stringify(routes, null, 2));
  return true;
}

/** Point every host whose bare name is `name` (after stripping `tlds`) at
    `port`, with the same in-place write as setRoutePort. App names may hold
    dots, so `deck.docs.mattstack` is not deck's. Returns the hostnames that
    moved; nothing is written when none did. */
export function repointRoutes(
  name: string,
  port: number,
  tlds: string[]
): string[] {
  const path = routesPath();
  let routes: Array<Record<string, unknown>>;
  try {
    routes = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
  const moved: string[] = [];
  for (const r of routes) {
    const host = String(r.hostname);
    if (bareName(host, tlds) !== name) continue;
    if (r.port === port) continue;
    r.port = port;
    moved.push(host);
  }
  if (moved.length) writeFileSync(path, JSON.stringify(routes, null, 2));
  return moved;
}

/** Drop every static (pid 0) host whose bare name is `name`, with the same
    in-place write as setRoutePort. A host with a live pid belongs to a
    `portless run` process, which portless prunes itself. Unlike the writers
    above, an unreadable or unwritable file throws: a remove must be able to
    report that the row it was asked to clear is still there. Returns the
    hostnames removed; nothing is written when none were. */
export function removeRoutes(name: string, tlds: string[]): string[] {
  const path = routesPath();
  if (!existsSync(path)) return [];
  const routes: Array<Record<string, unknown>> = JSON.parse(
    readFileSync(path, 'utf8')
  );
  const removed: string[] = [];
  const kept = routes.filter(r => {
    const host = String(r.hostname);
    if (r.pid !== 0 || bareName(host, tlds) !== name) return true;
    removed.push(host);
    return false;
  });
  if (removed.length) writeFileSync(path, JSON.stringify(kept, null, 2));
  return removed;
}
