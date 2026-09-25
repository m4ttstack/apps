import { isAbsolute, join, relative, resolve } from 'path';

import { readDeckManifest } from './deck-manifest.ts';
import { readSvgIcon } from './manifest.ts';

export interface AppIdentity {
  displayName: string;
  description?: string;
  badge?: string;
  /** The svg served at /api/apps/<name>/icon; null when the row advertises no icon. */
  iconFile: string | null;
}

/**
 * The identity repo-tools' build.sh lands at Contents/Resources/apps/<name>/
 * for a served app. Null when the dir is absent or anything in it fails the
 * checks ingestManifest applies to a checkout: the icon must stay inside the
 * dir, be svg-rooted and be at most 64 KB.
 */
export function readBundledIdentity(
  resourcesDir: string,
  name: string
): (AppIdentity & { iconFile: string }) | null {
  const dir = join(resourcesDir, 'apps', name);
  const parsed = readDeckManifest(dir);
  if (!parsed || !parsed.ok) return null;
  const m = parsed.manifest;
  if (m.name !== name || !m.displayName || !m.icon) return null;
  const iconFile = resolve(dir, m.icon);
  const rel = relative(dir, iconFile);
  if (rel === '' || rel === '..' || rel.startsWith('../') || isAbsolute(rel))
    return null;
  if (readSvgIcon(iconFile) === null) return null;
  return {
    displayName: m.displayName,
    ...(m.description !== undefined ? { description: m.description } : {}),
    ...(m.badge !== undefined ? { badge: m.badge } : {}),
    iconFile,
  };
}
