# Turborepo CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every gate in this repo run through Turborepo, cached and in parallel, with PRs running only the packages they affect.

**Architecture:** `turbo.json` declares per-package tasks (`build`, `build:binary`, `typecheck`, `lint`, `test`, `serve-check`, `gates`, `browsers`) and registered root tasks; `scripts/turbo.sh` is the one entry point, pointing turbo's cache at the repo's common git dir and expanding a `check` mode that names every CI gate. `ci.yml` calls `check --affected` on PRs and `check` on main. Root scripts become turbo-backed; the `<app>:<task>` aliases stay.

**Tech Stack:** Bun 1.4.2 workspaces, Turborepo 2.11.4, vitest 4, bun test, GitHub Actions (`actions/cache@v4`).

**Spec:** `docs/superpowers/specs/2026-09-25-turborepo-ci-design.md`

## Global Constraints

- Turbo is a root devDependency pinned to `2.11.4`; never `bunx turbo@latest`.
- `setup-bun` stays pinned to `1.4.2` in both CI jobs.
- Env mode is turbo's strict default; only `CI` passes through globally.
- The cache directory is `$(git rev-parse --path-format=absolute --git-common-dir)/turbo-cache`, nowhere else.
- Package scripts named `test` must exit (no watch mode): `vitest run`, never bare `vitest`.
- Comments in code state only what the code cannot show. No ticket ids, no process history, no narration.
- No em dashes or en dashes anywhere (code, docs, commits, PR body), and none of the phrases the global writing rules ban.
- Commit messages: lowercase imperative subject, ending with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Prettier formats `turbo.json` and every new `.ts` file; run `bun run format` before each commit.
- Nothing in this plan runs a compiled app or any test against a real `~/.mattstack`; the root `bun test` preload repoints HOME, and app tests keep their own preloads.

## Review Focus

1. A test that reads files outside its own package but declares no `$TURBO_ROOT$` inputs: turbo would serve a stale cache hit after the other package changes. Task 3 adds `scripts/__tests__/turbo-inputs.test.ts`, which fails for any test file resolving three or more levels up without a matching `inputs` entry.
2. A PR that touches only a root config (`eslint.config.js`, `.prettierrc`, `tsconfig.tools.json`, `bunfig.toml`): every package task must miss its cache. Task 3's graph test asserts those files sit in `globalCacheInputs.files`.
3. A PR touching only `apps/board`: `--affected` must still run the root gates (purity, format) and the tokens suite, which turbo's package graph does not consider affected. Task 4's `check` mode runs them in a second invocation with `--filter=//` and `--filter=@mattstack/tokens`, and its test pins that.
4. `check` on a Linux runner must never schedule `deck#test` (macOS-only `plutil`/`launchd`), while a Mac keeps running it. Task 4's test drives `scripts/turbo.sh` with a fake `uname` on PATH.
5. An interrupted `serve-check` for console leaves `dist/` hidden and a server listening. Task 2's script restores `dist/` and kills the server from an EXIT trap and refuses to start if `dist-hidden` already exists or the port already answers; the task verifies both refusals by hand.

---

### Task 1: Turbo dependency and the package task graph

**Files:**
- Modify: `package.json` (root): add `packageManager`, `turbo` devDependency, `scripts:test` script
- Create: `turbo.json`
- Modify: `.gitignore`: add `.turbo`
- Create: `scripts/__tests__/helpers.ts`, `scripts/__tests__/turbo-graph.test.ts`

**Interfaces:**
- Produces: `turbo.json` tasks `build`, `build:binary`, `typecheck`, `lint`, `test`; the root script `scripts:test` (`bun test scripts`); the helper module `scripts/__tests__/helpers.ts` exporting `ROOT`, `TURBO`, `DryRun` and `dryRun(args: string[], env?: Record<string, string>): DryRun`, used by every later test file (a test file must never import another test file: bun would register its tests twice).

- [ ] **Step 1: Install turbo and declare the package manager**

```bash
bun add -d turbo@2.11.4
```

Then in root `package.json`, next to `"private": true`, add:

```json
"packageManager": "bun@1.4.2",
```

and in `scripts` add:

```json
"scripts:test": "bun test scripts",
```

Append to `.gitignore`:

```
.turbo
```

- [ ] **Step 2: Write the helper module and the failing graph test**

Create `scripts/__tests__/helpers.ts`:

```ts
import { join } from 'path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const TURBO = join(ROOT, 'node_modules', '.bin', 'turbo');

export type DryRun = {
  packages: string[];
  globalCacheInputs: { files: Record<string, string> };
  tasks: Array<{
    taskId: string;
    package: string;
    task: string;
    dependencies: string[];
    inputs?: Record<string, string>;
    cache: { status: string };
  }>;
};

export function dryRun(args: string[], env: Record<string, string> = {}): DryRun {
  const proc = Bun.spawnSync([TURBO, 'run', ...args, '--dry=json'], {
    cwd: ROOT,
    env: { ...process.env, ...env, TURBO_TELEMETRY_DISABLED: '1' },
  });
  const out = proc.stdout.toString();
  if (proc.exitCode !== 0) throw new Error(`turbo failed: ${proc.stderr.toString()}\n${out}`);
  return JSON.parse(out.slice(out.indexOf('{'))) as DryRun;
}
```

Create `scripts/__tests__/turbo-graph.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT, dryRun, type DryRun } from './helpers.ts';

const byId = (run: DryRun) => new Map(run.tasks.map((t) => [t.taskId, t]));

describe('turbo task graph', () => {
  test('board and deck tests build tui-kit first', () => {
    const tasks = byId(dryRun(['test', '--filter=board', '--filter=deck']));
    expect(tasks.get('board#test')?.dependencies).toContain('@mattstack/tui-kit#build');
    expect(tasks.get('deck#test')?.dependencies).toContain('@mattstack/tui-kit#build');
  });

  test('typecheck depends on dependency builds', () => {
    const tasks = byId(dryRun(['typecheck', '--filter=board']));
    expect(tasks.get('board#typecheck')?.dependencies).toContain('@mattstack/tui-kit#build');
  });

  test('build outputs are dist, build:binary outputs are dist-bin', () => {
    const tasks = byId(dryRun(['build', 'build:binary', '--filter=mattstack-console']));
    expect(tasks.get('mattstack-console#build:binary')?.dependencies).toContain(
      'mattstack-console#build'
    );
  });
});
```

- [ ] **Step 3: Run the test to see it fail**

Run: `bun test scripts/__tests__/turbo-graph.test.ts`
Expected: FAIL. turbo exits non-zero with "Could not find turbo.json" (or the tasks map is empty).

- [ ] **Step 4: Write `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "globalDependencies": [
    "tsconfig.tools.json",
    ".prettierrc",
    "bunfig.toml",
    "eslint.config.js"
  ],
  "globalPassThroughEnv": ["CI"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "build:binary": {
      "dependsOn": ["build"],
      "outputs": ["dist/**", "dist-bin/**", "src/server/embedded/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

`build:binary` depends on the package's own `build` (not just `^build`) because both write `dist/`; serialising them is what stops a race when `bun run build` and `bun run build:binary` are both in flight.

- [ ] **Step 5: Run the test to see it pass**

Run: `bun test scripts/__tests__/turbo-graph.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Prove the graph resolves for every package**

Run: `node_modules/.bin/turbo run test typecheck lint build --dry=json | jq -r '.tasks[].taskId' | sort`
Expected: 40 or so task ids, including `@mattstack/tui-kit#build`, `board#test`, `deck#test`, `workshop#build`, and no error about a missing script.

- [ ] **Step 7: Format and commit**

```bash
bun run format
git add package.json bun.lock turbo.json .gitignore scripts/__tests__
git commit -m "turbo: add task graph and pin turbo 2.11.4

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Package scripts that mean the same thing locally and in CI

**Files:**
- Modify: `packages/ui/package.json`, `packages/server/package.json`, `apps/chat/package.json`, `apps/console/package.json` (`test` and `test:watch`)
- Modify: `packages/tui-kit/package.json` (`test`, `test:oracles`, `browsers`)
- Modify: `apps/chat/package.json`, `apps/console/package.json`, `apps/boxscore/package.json` (`serve-check`)
- Create: `apps/chat/scripts/serve-check.sh`, `apps/console/scripts/serve-check.sh`
- Modify: `turbo.json` (per-package overrides: `serve-check`, `browsers`, `gates`)
- Modify: `scripts/__tests__/turbo-graph.test.ts` (new cases)

**Interfaces:**
- Consumes: `dryRun` from Task 1.
- Produces: package tasks `serve-check` (chat, mattstack-console, boxscore), `browsers` and `gates` (`@mattstack/tui-kit`). `serve-check` scripts honour `GATE_PORT` and default to 11123 (chat), 11099 (console), 11097 (boxscore).

- [ ] **Step 1: Write the failing graph tests**

Append to `scripts/__tests__/turbo-graph.test.ts` inside the `describe`:

```ts
  test('serve-check waits for the artifact it serves', () => {
    const tasks = byId(
      dryRun(['serve-check', '--filter=chat', '--filter=mattstack-console', '--filter=boxscore'])
    );
    expect(tasks.get('chat#serve-check')?.dependencies).toContain('chat#build');
    expect(tasks.get('mattstack-console#serve-check')?.dependencies).toContain(
      'mattstack-console#build:binary'
    );
    expect(tasks.get('boxscore#serve-check')?.dependencies).toContain('boxscore#build:binary');
  });

  test('tui-kit tests install browsers first, and the install is never cached', () => {
    const tasks = byId(dryRun(['test', '--filter=@mattstack/tui-kit']));
    expect(tasks.get('@mattstack/tui-kit#test')?.dependencies).toContain(
      '@mattstack/tui-kit#browsers'
    );
    expect(tasks.get('@mattstack/tui-kit#browsers')?.cache.status).toBe('MISS');
  });

  test('every test script exits on its own (no watch mode)', () => {
    const glob = new Bun.Glob('{apps,packages}/*/package.json');
    for (const file of glob.scanSync(ROOT)) {
      const pkg = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
      const script: string | undefined = pkg.scripts?.test;
      if (!script) continue;
      expect(script, `${file} test script`).not.toMatch(/(^|&&\s*)vitest(\s|$)/);
    }
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun test scripts/__tests__/turbo-graph.test.ts`
Expected: FAIL. `serve-check` tasks are absent, `@mattstack/tui-kit#browsers` is absent, and `packages/ui/package.json test script` matches bare `vitest`.

- [ ] **Step 3: Fix the `test` scripts**

In `packages/ui/package.json`, `packages/server/package.json`, `apps/chat/package.json` and `apps/console/package.json`, change:

```json
"test": "vitest",
```

to:

```json
"test": "vitest run",
"test:watch": "vitest",
```

In `packages/tui-kit/package.json`, replace `"test": "vitest run",` with:

```json
"test": "vitest run --project node && vitest run --project browser --exclude '**/*.visual.test.tsx' --exclude '**/*.parity.test.tsx'",
"test:oracles": "vitest run --project browser '**/*.visual.test.tsx' '**/*.parity.test.tsx'",
"browsers": "bunx playwright install chromium",
```

The visual and parity suites are recorded against one local Chrome, so they stay out of `test` until CI-recorded baselines exist; `test:oracles` is the local way to run them.

- [ ] **Step 4: Write chat's serve-check script**

Create `apps/chat/scripts/serve-check.sh` (make it executable with `chmod +x`):

```bash
#!/usr/bin/env bash
# Serves the built client and proves /api is not swallowed by the SPA
# fallback: an unmatched /api route must stay a JSON 404, since an RPC
# client checks res.ok and would otherwise throw parsing HTML.
set -euo pipefail

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
port=${GATE_PORT:-11123}
base="http://127.0.0.1:$port"

say() { echo "serve-check: $*" >&2; }

[ -d "$app_dir/dist" ] || { say "$app_dir/dist is missing; run bun run build first"; exit 1; }
if curl -s -m 1 -o /dev/null "$base/"; then
  say "port $port already answers; set GATE_PORT to a free port"
  exit 1
fi

work=$(mktemp -d)
server=""
cleanup() {
  if [ -n "$server" ]; then
    kill "$server" 2>/dev/null || true
    wait "$server" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  say "$*"
  if [ -f "$work/server.log" ]; then sed 's/^/  server: /' "$work/server.log" >&2; fi
  exit 1
}

(cd "$app_dir" && exec env PORT="$port" bun src/server/index.ts) > "$work/server.log" 2>&1 &
server=$!
for _ in $(seq 1 30); do
  curl -fsS -m 1 -o /dev/null "$base/api/health" 2>/dev/null && break
  kill -0 "$server" 2>/dev/null || fail "server exited before answering /api/health"
  sleep 1
done
curl -fsS -m 5 -o /dev/null "$base/api/health" || fail "never answered /api/health"

code() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$base$1"; }
ctype() { curl -s -m 5 -o /dev/null -w '%{content_type}' "$base$1"; }

[ "$(code /)" = 200 ] || fail "/ answered $(code /)"
[ "$(ctype /)" = "text/html; charset=utf-8" ] || fail "/ is $(ctype /), not the built index"
index=$(curl -fsS -m 5 "$base/")
re_js='(/assets/[^"]+\.js)'
[[ $index =~ $re_js ]] || fail "index.html references no /assets/*.js"
[ "$(code "${BASH_REMATCH[1]}")" = 200 ] || fail "${BASH_REMATCH[1]} answered $(code "${BASH_REMATCH[1]}")"
[ "$(code /api/does-not-exist)" = 404 ] || fail "/api/does-not-exist was swallowed by the SPA fallback"
[ "$(ctype /api/does-not-exist)" = "application/json" ] || fail "the /api 404 is $(ctype /api/does-not-exist), not JSON"

say "chat serves the built client and keeps /api out of the SPA fallback"
```

- [ ] **Step 5: Write console's serve-check script**

Create `apps/console/scripts/serve-check.sh` (executable):

```bash
#!/usr/bin/env bash
# console ships a self-contained binary; the only honest test is to run it
# where dist/ is not: a binary built without the codegen step falls back to
# disk mode and 404s every page, which passes silently anywhere the source
# tree happens to sit next to it.
set -euo pipefail

app_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
bin="$app_dir/dist-bin/console"
port=${GATE_PORT:-11099}
base="http://127.0.0.1:$port"
hidden="$app_dir/dist-hidden"

say() { echo "serve-check: $*" >&2; }

[ -x "$bin" ] || { say "$bin is missing; run bun run build:binary first"; exit 1; }
[ ! -e "$hidden" ] || { say "$hidden is left from an interrupted run; move it back to $app_dir/dist"; exit 1; }
if curl -s -m 1 -o /dev/null "$base/"; then
  say "port $port already answers; set GATE_PORT to a free port"
  exit 1
fi

work=$(mktemp -d)
moved=0
server=""
cleanup() {
  if [ -n "$server" ]; then
    kill "$server" 2>/dev/null || true
    wait "$server" 2>/dev/null || true
  fi
  if [ "$moved" = 1 ]; then mv "$hidden" "$app_dir/dist"; fi
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  say "$*"
  if [ -f "$work/server.log" ]; then sed 's/^/  server: /' "$work/server.log" >&2; fi
  exit 1
}

cp "$bin" "$work/console"
if [ -d "$app_dir/dist" ]; then
  mv "$app_dir/dist" "$hidden"
  moved=1
fi

(cd "$work" && exec env PORT="$port" ./console) > "$work/server.log" 2>&1 &
server=$!
for _ in $(seq 1 30); do
  curl -fsS -m 1 -o /dev/null "$base/api/health" 2>/dev/null && break
  kill -0 "$server" 2>/dev/null || fail "binary exited before answering /api/health"
  sleep 1
done
curl -fsS -m 5 -o /dev/null "$base/api/health" || fail "never answered /api/health"

code() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$base$1"; }
ctype() { curl -s -m 5 -o /dev/null -w '%{content_type}' "$base$1"; }

[ "$(code /)" = 200 ] || fail "/ answered $(code /); the embedded index is missing"
[ "$(code /search)" = 200 ] || fail "/search answered $(code /search)"
index=$(curl -fsS -m 5 "$base/")
re_js='(/assets/[^"]+\.js)'
re_css='(/assets/[^"]+\.css)'
re_font='(/assets/[^)"]+\.woff2)'
[[ $index =~ $re_js ]] || fail "index.html references no /assets/*.js"
[ "$(code "${BASH_REMATCH[1]}")" = 200 ] || fail "${BASH_REMATCH[1]} answered $(code "${BASH_REMATCH[1]}")"
[[ $index =~ $re_css ]] || fail "index.html references no /assets/*.css"
css=$(curl -fsS -m 5 "$base${BASH_REMATCH[1]}") || fail "the stylesheet did not load"
# The font ships inside @mattstack/mantine-tokyo, so Vite emits it as a
# content-hashed /assets/ URL; assert the content type, not just the status,
# because a catch-all can answer any path with 200.
[[ $css =~ $re_font ]] || fail "the stylesheet references no /assets/*.woff2"
font=${BASH_REMATCH[1]}
[ "$(code "$font")" = 200 ] || fail "$font answered $(code "$font")"
[ "$(ctype "$font")" = "font/woff2" ] || fail "$font is $(ctype "$font"), not font/woff2"

say "console's binary serves its own assets with no source tree"
```

- [ ] **Step 6: Wire the `serve-check` scripts**

`apps/chat/package.json` scripts, add:

```json
"serve-check": "bash scripts/serve-check.sh",
```

`apps/console/package.json` scripts, add the same line.

`apps/boxscore/package.json` scripts, add:

```json
"serve-check": "bash scripts/binary-gate.sh",
```

(`binary-gate.sh` keeps its name; only the turbo task name is new.)

- [ ] **Step 7: Add the per-package overrides to `turbo.json`**

Inside `"tasks"`, after `"test"`:

```json
    "serve-check": {
      "dependsOn": ["build"]
    },
    "mattstack-console#serve-check": {
      "dependsOn": ["build:binary"]
    },
    "boxscore#serve-check": {
      "dependsOn": ["build:binary"]
    },
    "@mattstack/tui-kit#browsers": {
      "cache": false
    },
    "@mattstack/tui-kit#test": {
      "dependsOn": ["^build", "browsers"]
    },
    "@mattstack/tui-kit#gates": {
      "dependsOn": ["^build"]
    }
```

- [ ] **Step 8: Run the graph tests**

Run: `bun test scripts/__tests__/turbo-graph.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Run the three serve-checks for real**

```bash
node_modules/.bin/turbo run serve-check --filter=chat --filter=mattstack-console --filter=boxscore --output-logs=new-only
```

Expected: builds run (chat build, console build and build:binary, boxscore build and build:binary), then three lines ending in `serves ...`. Then verify the two refusals by hand:

```bash
mkdir apps/console/dist-hidden && bash apps/console/scripts/serve-check.sh; echo "exit=$?"; rmdir apps/console/dist-hidden
```

Expected: `serve-check: .../dist-hidden is left from an interrupted run ...` and `exit=1`, and `apps/console/dist` still present.

```bash
(cd apps/chat && PORT=11123 bun src/server/index.ts >/dev/null 2>&1 &) ; sleep 2; bash apps/chat/scripts/serve-check.sh; echo "exit=$?"; pkill -f 'bun src/server/index.ts'
```

Expected: `serve-check: port 11123 already answers ...` and `exit=1`.

- [ ] **Step 10: Run tui-kit's split test once**

Run: `node_modules/.bin/turbo run test --filter=@mattstack/tui-kit --output-logs=new-only`
Expected: `browsers` runs (fast when Chromium is present), then the node project and the browser project pass with the visual and parity files excluded (the log lists the files it ran; none end in `.visual.test.tsx` or `.parity.test.tsx`).

- [ ] **Step 11: Format and commit**

```bash
bun run format
git add turbo.json packages/ui/package.json packages/server/package.json packages/tui-kit/package.json apps/chat apps/console apps/boxscore/package.json scripts/__tests__/turbo-graph.test.ts
git commit -m "turbo: serve-check tasks, browser install task, non-watch test scripts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Root tasks and cross-package inputs

**Files:**
- Modify: `package.json` (root): `tokens:fresh`, `purity` scripts
- Modify: `turbo.json`: root tasks and `@mattstack/tokens#test` inputs
- Modify: `scripts/__tests__/turbo-graph.test.ts` (new cases)
- Create: `scripts/__tests__/turbo-inputs.test.ts`

**Interfaces:**
- Consumes: `dryRun`, `ROOT` from Task 1.
- Produces: root tasks `//#lint`, `//#format:check`, `//#tokens:fresh`, `//#build-storybook`, `//#treeshake`, `//#purity`, `//#scripts:test`; the tokens inputs list.

- [ ] **Step 1: Write the failing graph tests**

Append to the `describe` in `scripts/__tests__/turbo-graph.test.ts`:

```ts
  test('root gates are registered root tasks', () => {
    const run = dryRun([
      'lint', 'format:check', 'tokens:fresh', 'build-storybook', 'treeshake', 'purity', 'scripts:test',
      '--filter=//',
    ]);
    const ids = run.tasks.map((t) => t.taskId).sort();
    expect(ids).toEqual([
      '//#build-storybook', '//#format:check', '//#lint', '//#purity', '//#scripts:test',
      '//#tokens:fresh', '//#treeshake',
    ]);
  });

  test('root configs are global cache inputs', () => {
    const files = Object.keys(dryRun(['lint', '--filter=//']).globalCacheInputs.files);
    for (const f of ['tsconfig.tools.json', '.prettierrc', 'bunfig.toml', 'eslint.config.js']) {
      expect(files).toContain(f);
    }
  });

  test('the tokens suite hashes the trees it reads from disk', () => {
    const task = byId(dryRun(['test', '--filter=@mattstack/tokens'])).get('@mattstack/tokens#test');
    const inputs = Object.keys(task?.inputs ?? {});
    expect(inputs.some((f) => f.startsWith('packages/ui/src/'))).toBe(true);
    expect(inputs.some((f) => f.startsWith('packages/tokyo/src/'))).toBe(true);
    expect(inputs.some((f) => f.startsWith('packages/tui-kit/src/'))).toBe(true);
  });
```

- [ ] **Step 2: Write the failing inputs guard**

Create `scripts/__tests__/turbo-inputs.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');

// A test that resolves the repo root reads other packages from disk, which
// turbo's per-package hash cannot see; it must declare $TURBO_ROOT$ inputs.
const REACHES_ROOT = /import\.meta\.dirname,\s*'\.\.',\s*'\.\.',\s*'\.\.'/;

function packageOf(file: string): string {
  const [kind, name] = relative(ROOT, file).split(sep);
  const pkg = JSON.parse(readFileSync(join(ROOT, kind, name, 'package.json'), 'utf8'));
  return pkg.name as string;
}

test('every test that reads outside its package declares $TURBO_ROOT$ inputs', () => {
  const turbo = JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8'));
  const glob = new Bun.Glob('{apps,packages}/*/**/*.test.{ts,tsx}');
  const offenders: string[] = [];
  for (const rel of glob.scanSync(ROOT)) {
    if (rel.includes('/node_modules/')) continue;
    const file = join(ROOT, rel);
    if (!REACHES_ROOT.test(readFileSync(file, 'utf8'))) continue;
    const inputs: string[] = turbo.tasks[`${packageOf(file)}#test`]?.inputs ?? [];
    if (!inputs.some((i) => i.startsWith('$TURBO_ROOT$/'))) offenders.push(rel);
  }
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 3: Run both files to see them fail**

Run: `bun test scripts`
Expected: FAIL. The root-task test lists only `//#lint`-style ids that exist (none yet), the tokens inputs test finds no `packages/ui/src/` input, and the guard names `packages/tokens/test/consumption.test.ts`, `font-identity.test.ts`, `fragment-sync.test.ts`.

- [ ] **Step 4: Add the root scripts**

Root `package.json` scripts, add:

```json
"tokens:fresh": "bun run tokens:radix && bun run tokens:codegen && bun run tokens:ramps && git diff --exit-code packages/tokens/src/radix.ts packages/tui-kit/src/generated packages/tui-kit/assets packages/tokyo/src",
"purity": "scripts/repo-purity.sh",
```

- [ ] **Step 5: Register the root tasks and the tokens inputs in `turbo.json`**

Inside `"tasks"`, add:

```json
    "@mattstack/tokens#test": {
      "dependsOn": ["^build"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "$TURBO_ROOT$/packages/ui/src/**",
        "$TURBO_ROOT$/packages/tokyo/src/**",
        "$TURBO_ROOT$/packages/tui-kit/src/**"
      ]
    },
    "//#lint": {
      "inputs": [
        "$TURBO_DEFAULT$",
        "$TURBO_ROOT$/packages/**",
        "$TURBO_ROOT$/.storybook/**",
        "$TURBO_ROOT$/stories/**",
        "$TURBO_ROOT$/apps/board/src/**/*.css"
      ]
    },
    "//#format:check": {
      "inputs": [
        "$TURBO_DEFAULT$",
        "$TURBO_ROOT$/apps/**",
        "$TURBO_ROOT$/packages/**",
        "$TURBO_ROOT$/.prettierignore"
      ]
    },
    "//#tokens:fresh": {
      "inputs": [
        "$TURBO_ROOT$/packages/tokens/**",
        "$TURBO_ROOT$/packages/tui-kit/src/generated/**",
        "$TURBO_ROOT$/packages/tui-kit/assets/**",
        "$TURBO_ROOT$/packages/tokyo/src/**"
      ]
    },
    "//#build-storybook": {
      "inputs": [
        "$TURBO_DEFAULT$",
        "$TURBO_ROOT$/.storybook/**",
        "$TURBO_ROOT$/stories/**",
        "$TURBO_ROOT$/packages/ui/**",
        "$TURBO_ROOT$/packages/tokyo/**",
        "$TURBO_ROOT$/apps/console/src/**"
      ],
      "outputs": ["storybook-static/**"]
    },
    "//#treeshake": {
      "inputs": ["$TURBO_ROOT$/packages/ui/**"]
    },
    "//#purity": {
      "inputs": ["$TURBO_ROOT$/**"]
    },
    "//#scripts:test": {
      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/scripts/**", "$TURBO_ROOT$/turbo.json"]
    }
```

Turbo hashes git-tracked and untracked-but-not-ignored files, so `node_modules`, `dist` and `storybook-static` never enter an input set.

- [ ] **Step 6: Run the tests to see them pass**

Run: `bun test scripts`
Expected: PASS, 10 tests across 2 files.

- [ ] **Step 7: Run the root tasks once, then again**

```bash
node_modules/.bin/turbo run lint format:check tokens:fresh build-storybook treeshake purity scripts:test --filter=// --output-logs=errors-only
node_modules/.bin/turbo run lint format:check tokens:fresh build-storybook treeshake purity scripts:test --filter=// --output-logs=errors-only
```

Expected: first run ends `Tasks: 7 successful, 7 total`, `Cached: 0 cached`; second run ends `Cached: 7 cached, 7 total` and `>>> FULL TURBO`.

- [ ] **Step 8: Format and commit**

```bash
bun run format
git add package.json turbo.json scripts/__tests__
git commit -m "turbo: register root gates and the tokens suite's cross-package inputs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `scripts/turbo.sh`, turbo-backed root scripts, and the spec amendment

**Files:**
- Create: `scripts/turbo.sh`
- Create: `scripts/__tests__/turbo-sh.test.ts`
- Modify: `package.json` (root scripts)
- Modify: `docs/superpowers/specs/2026-09-25-turborepo-ci-design.md` (section 3, step 5)

**Interfaces:**
- Consumes: the task names from Tasks 1 to 3.
- Produces: `scripts/turbo.sh <task>... [flags]` and `scripts/turbo.sh check [flags]`. `check` runs two turbo invocations: package gates (with `--affected` and `--filter=!deck` off macOS when given), then root gates plus the tokens suite with `--affected` stripped. Every root script and `<app>:<task>` alias goes through it.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/turbo-sh.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ROOT, type DryRun } from './helpers.ts';

const SCRIPT = join(ROOT, 'scripts', 'turbo.sh');

function run(args: string[], opts: { uname?: string; env?: Record<string, string> } = {}) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...opts.env,
    TURBO_TELEMETRY_DISABLED: '1',
  };
  if (opts.uname) {
    const bin = mkdtempSync(join(tmpdir(), 'fake-uname-'));
    writeFileSync(join(bin, 'uname'), `#!/bin/sh\necho ${opts.uname}\n`);
    chmodSync(join(bin, 'uname'), 0o755);
    env.PATH = `${bin}:${process.env.PATH}`;
  }
  const proc = Bun.spawnSync(['bash', SCRIPT, ...args], { cwd: ROOT, env });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

// `check --dry=json` prints one JSON document per turbo invocation.
function documents(out: string): DryRun[] {
  return out
    .split(/\n}\n(?=\{)/)
    .map((chunk, i, all) => (i < all.length - 1 ? `${chunk}\n}` : chunk))
    .map((chunk) => JSON.parse(chunk.slice(chunk.indexOf('{'))) as DryRun);
}

const commonDir = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: ROOT,
}).stdout.toString().trim();

describe('scripts/turbo.sh', () => {
  test('caches under the repo common git dir', () => {
    const r = run(['typecheck', '--filter=@mattstack/tokens', '--output-logs=none']);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(join(commonDir, 'turbo-cache'))).toBe(true);
  });

  test('check runs the package gates, then the root gates and the tokens suite', () => {
    const r = run(['check', '--dry=json']);
    expect(r.code, r.err).toBe(0);
    const [pkgs, roots] = documents(r.out);
    const pkgIds = pkgs.tasks.map((t) => t.taskId);
    expect(pkgIds).toContain('board#test');
    expect(pkgIds).toContain('chat#serve-check');
    expect(pkgIds).toContain('@mattstack/tui-kit#gates');
    const rootIds = roots.tasks.map((t) => t.taskId).sort();
    expect(rootIds).toEqual([
      '//#build-storybook', '//#format:check', '//#lint', '//#purity', '//#scripts:test',
      '//#tokens:fresh', '//#treeshake', '@mattstack/tokens#test',
    ]);
  });

  test('check keeps deck on macOS and drops it elsewhere', () => {
    const mac = documents(run(['check', '--dry=json'], { uname: 'Darwin' }).out)[0];
    const linux = documents(run(['check', '--dry=json'], { uname: 'Linux' }).out)[0];
    expect(mac.tasks.map((t) => t.taskId)).toContain('deck#test');
    expect(linux.tasks.map((t) => t.taskId)).not.toContain('deck#test');
  });

  test('check --affected still runs every root gate', () => {
    const r = run(['check', '--affected', '--dry=json'], {
      env: { TURBO_SCM_BASE: 'HEAD' },
    });
    expect(r.code, r.err).toBe(0);
    const docs = documents(r.out);
    const roots = docs[docs.length - 1].tasks.map((t) => t.taskId);
    expect(roots).toContain('//#purity');
    expect(roots).toContain('@mattstack/tokens#test');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `bun test scripts/__tests__/turbo-sh.test.ts`
Expected: FAIL, `bash: scripts/turbo.sh: No such file or directory` (exit code 127) in every case.

- [ ] **Step 3: Write `scripts/turbo.sh`**

Create it executable (`chmod +x scripts/turbo.sh`):

```bash
#!/usr/bin/env bash
# The one entry point for turbo.
#   scripts/turbo.sh <task>... [turbo flags]
#   scripts/turbo.sh check [turbo flags]     every gate ci.yml runs
# The cache lives in the repo's common git dir so every worktree of this
# checkout shares it, and CI restores the same path.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
turbo="$root/node_modules/.bin/turbo"
cache="$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)/turbo-cache"

if [ "${1:-}" != check ]; then
  exec "$turbo" run "$@" --cache-dir="$cache"
fi
shift

pkg_flags=("$@")
if [ "$(uname)" != Darwin ]; then
  pkg_flags+=('--filter=!deck')
fi
"$turbo" run typecheck lint test build:binary serve-check gates \
  ${pkg_flags[@]+"${pkg_flags[@]}"} --cache-dir="$cache"

# --affected walks the package graph, not task inputs. The root gates and the
# tokens suite read trees the graph does not connect them to, so they run on
# every check and let their declared inputs decide the cache hit.
root_flags=()
for flag in "$@"; do
  if [ "$flag" != --affected ]; then root_flags+=("$flag"); fi
done
"$turbo" run lint format:check tokens:fresh build-storybook treeshake purity scripts:test test \
  --filter=// --filter=@mattstack/tokens \
  ${root_flags[@]+"${root_flags[@]}"} --cache-dir="$cache"
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test scripts/__tests__/turbo-sh.test.ts`
Expected: PASS, 4 tests. (The first test runs a real tokens typecheck; a few seconds.)

- [ ] **Step 5: Rewire the root scripts**

In root `package.json`, replace these scripts (leave `format`, `storybook`, `tokens:*`, `deck:test-dom`, `tokens:fresh`, `purity`, `scripts:test`, `build-storybook`, `treeshake` as they are):

```json
"typecheck": "scripts/turbo.sh typecheck",
"lint": "scripts/turbo.sh lint lint:root",
"test": "scripts/turbo.sh test",
"build": "scripts/turbo.sh build",
"check": "scripts/turbo.sh check",
"format:check": "prettier --check . --cache",
"tui-kit:build": "scripts/turbo.sh build --filter=@mattstack/tui-kit",
"tui-kit:test": "scripts/turbo.sh test --filter=@mattstack/tui-kit",
"tui-kit:gates": "scripts/turbo.sh gates --filter=@mattstack/tui-kit",
"tokens:test": "scripts/turbo.sh test --filter=@mattstack/tokens",
"gate-kit:test": "scripts/turbo.sh test --filter=@mattstack/gate-kit",
"chat:typecheck": "scripts/turbo.sh typecheck --filter=chat",
"chat:lint": "scripts/turbo.sh lint --filter=chat",
"chat:test": "scripts/turbo.sh test --filter=chat",
"chat:build": "scripts/turbo.sh build --filter=chat",
"console:typecheck": "scripts/turbo.sh typecheck --filter=mattstack-console",
"console:lint": "scripts/turbo.sh lint --filter=mattstack-console",
"console:test": "scripts/turbo.sh test --filter=mattstack-console",
"console:build": "scripts/turbo.sh build --filter=mattstack-console",
"boxscore:typecheck": "scripts/turbo.sh typecheck --filter=boxscore",
"boxscore:lint": "scripts/turbo.sh lint --filter=boxscore",
"boxscore:test": "scripts/turbo.sh test --filter=boxscore",
"board:typecheck": "scripts/turbo.sh typecheck --filter=board",
"board:test": "scripts/turbo.sh test --filter=board",
"board:build": "scripts/turbo.sh build --filter=board",
"deck:test": "scripts/turbo.sh test --filter=deck",
```

`format:check` stays a plain prettier script because `//#format:check` invokes it. The root eslint run cannot stay under the name `lint`, because `//#lint` would then invoke `scripts/turbo.sh lint` and recurse; rename it to `lint:root` and point the root task at it (`bun run lint` runs `lint lint:root`, so it still covers both the packages and the root):

```json
"lint:root": "eslint --no-error-on-unmatched-pattern packages .storybook stories 'apps/board/src/**/*.css'",
```

and in `turbo.json` rename the `//#lint` entry to `//#lint:root`; update `scripts/turbo.sh`'s second invocation and both tests (`'//#lint'` becomes `'//#lint:root'`, and the second invocation lists `lint:root` instead of `lint`).

- [ ] **Step 6: Re-run every scripts test, then the whole check**

Run: `bun test scripts`
Expected: PASS, 14 tests across 3 files.

Run: `bun run check`
Expected: exits 0. First invocation ends `Tasks: N successful, N total` with deck included (this is a Mac), second ends with the 8 root-side tasks. Then run `bun run check` once more: both invocations report `>>> FULL TURBO`.

- [ ] **Step 7: Amend the spec's CI step to match**

In `docs/superpowers/specs/2026-09-25-turborepo-ci-design.md`, section 3, replace:

```
5. On `pull_request`: `scripts/turbo.sh check --affected`.
   On `push` to main: `scripts/turbo.sh check`.
   Root tasks are part of `check` and are not subject to `--affected`
   (turbo treats the root as affected when root files change; their
   declared `inputs` decide whether they rerun).
```

with:

```
5. On `pull_request`: `scripts/turbo.sh check --affected` with
   `TURBO_SCM_BASE` set to the PR's base sha. On `push` to main:
   `scripts/turbo.sh check`.
   `check` is two turbo invocations: the package gates (with
   `--affected` when given), then the root gates plus
   `@mattstack/tokens#test` with `--affected` stripped, because
   `--affected` walks the package graph and would skip the root and
   tokens when only an app changed. Their declared `inputs` decide the
   cache hit.
```

Also in section 1, replace the two sentences about `//#lint` (the bullet and the "`turbo run lint` runs both" paragraph) with: "`//#lint:root`: the root eslint run over `packages`, `.storybook`, `stories` and board's CSS. It is not named `lint` because the root `lint` script is turbo-backed and would recurse; `bun run lint` runs `lint lint:root`, so it covers both." And in section 2, replace the `check` expansion with: "`check`: `scripts/turbo.sh check`, two turbo invocations: `typecheck lint test build:binary serve-check gates` (the package gates; dependency builds arrive through `^build`, app builds through `serve-check`), then `lint:root format:check tokens:fresh build-storybook treeshake purity scripts:test test --filter=// --filter=@mattstack/tokens`. This list is the one definition of what CI gates."

- [ ] **Step 8: Format and commit**

```bash
bun run format
git add scripts/turbo.sh scripts/__tests__ package.json turbo.json docs/superpowers/specs/2026-09-25-turborepo-ci-design.md
git commit -m "turbo: scripts/turbo.sh entry point, turbo-backed root scripts

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml` (rewrite)

**Interfaces:**
- Consumes: `scripts/turbo.sh check` from Task 4.

- [ ] **Step 1: Rewrite `.github/workflows/ci.yml`**

Keep the `on:` and `concurrency:` blocks exactly as they are on `main` (from #158). Replace everything under `jobs:` with:

```yaml
env:
  TURBO_TELEMETRY_DISABLED: '1'

jobs:
  checks:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          # --affected diffs the PR head against its base sha.
          fetch-depth: 0
      # Pinned: deck's core/generated-fresh.test.ts and tui-kit's codegen gate
      # byte-compare committed artifacts against a live rebuild, and bun's
      # bundler/minifier output is not stable across bun versions. Bump this
      # pin only together with the local bun upgrade that regenerates those
      # committed files.
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.4.2'
      - run: bun install --frozen-lockfile
      # --frozen-lockfile passes a stale workspace package version, which every
      # worktree's ready-step install then rewrites and leaves as dirt.
      - run: bun install && git diff --exit-code -- bun.lock
      - uses: actions/cache@v4
        with:
          path: .git/turbo-cache
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-
      - if: github.event_name == 'pull_request'
        run: scripts/turbo.sh check --affected
        env:
          TURBO_SCM_BASE: ${{ github.event.pull_request.base.sha }}
      - if: github.event_name != 'pull_request'
        run: scripts/turbo.sh check

  # deck supervises launchd and shells to plutil, both macOS-only, so its
  # suite runs here and nowhere else (scripts/turbo.sh drops it off macOS).
  deck-macos:
    runs-on: macos-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.4.2'
      - run: bun install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: .git/turbo-cache
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-
      - if: github.event_name == 'pull_request'
        run: scripts/turbo.sh test --filter=deck --affected
        env:
          TURBO_SCM_BASE: ${{ github.event.pull_request.base.sha }}
      - if: github.event_name != 'pull_request'
        run: scripts/turbo.sh test --filter=deck
```

Every gate the old file ran maps to a task; keep this table for the PR body:

| old step | new task |
| --- | --- |
| tokens codegen byte-compare | `//#tokens:fresh` |
| `typecheck` | `typecheck` (all packages) |
| `lint` | `//#lint:root` plus `lint` (chat, console, boxscore) |
| `format:check` | `//#format:check` |
| `test -- --run` | `@mattstack/app-kit#test`, `@mattstack/app-server#test` |
| `tokens:test` | `@mattstack/tokens#test` (always, with cross-package inputs) |
| `gate-kit:test` | `@mattstack/gate-kit#test` |
| `tui-kit:build` | `@mattstack/tui-kit#build` (via `^build`) |
| `build-storybook`, `treeshake` | `//#build-storybook`, `//#treeshake` |
| `tui-kit:gates` | `@mattstack/tui-kit#gates` |
| tui-kit node + browser runs, playwright install | `@mattstack/tui-kit#test`, `#browsers` |
| chat typecheck/lint/test/build, served-client gate | `chat#typecheck`, `#lint`, `#test`, `#build`, `#serve-check` |
| console typecheck/lint/test/build, build:binary, binary gate | `mattstack-console#...`, `#build:binary`, `#serve-check` |
| boxscore typecheck/lint/test, build:binary, binary gate | `boxscore#...`, `#build:binary`, `#serve-check` |
| board typecheck/test | `board#typecheck`, `board#test` |
| repo purity | `//#purity` |
| deck-macos: tui-kit build, deck test | `deck#test` (pulls `@mattstack/tui-kit#build`) |

- [ ] **Step 2: Lint the workflow**

Run: `actionlint .github/workflows/ci.yml`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run every gate through turbo, affected-only on PRs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Docs

**Files:**
- Modify: `AGENTS.md` ("CI shape", "Per-app root scripts", the tui-kit build paragraph)
- Modify: `README.md` (lines 84 to 85 and the two command lists near lines 150 to 172)

- [ ] **Step 1: Rewrite AGENTS.md "CI shape"**

Replace the three paragraphs under `### CI shape` with:

```markdown
### CI shape

Every gate runs through Turborepo (`turbo.json`, entry point
`scripts/turbo.sh`). `bun run check` is exactly what CI runs:
`.github/workflows/ci.yml`'s `checks` job (ubuntu) calls
`scripts/turbo.sh check --affected` on PRs and `check` on main; `deck-macos`
runs `test --filter=deck` because deck shells to `plutil`/`launchd`, both
macOS-only, and `scripts/turbo.sh` drops deck off macOS.

`check` is two turbo invocations: the package gates (`typecheck`, `lint`,
`test`, `build:binary`, `serve-check`, `gates`), then the root gates
(`lint:root`, `format:check`, `tokens:fresh`, `build-storybook`,
`treeshake`, `purity`, `scripts:test`) plus `@mattstack/tokens#test`.
The second group runs on every PR whatever changed, because `--affected`
walks the package graph and those tasks read trees the graph does not
connect them to; their declared `inputs` decide the cache hit.

The cache is `<common git dir>/turbo-cache`, shared by every worktree of
the checkout; CI restores the same path from the Actions cache. `--force`
bypasses it. A test that reads files outside its own package must declare
them as `$TURBO_ROOT$` inputs on its package's `test` task;
`scripts/__tests__/turbo-inputs.test.ts` fails otherwise.

`setup-bun` is pinned to `1.4.2` in both jobs. The pin exists because
CI byte-compares generated/committed artifacts (deck's
`core/generated-fresh.test.ts`, tui-kit's codegen gate) against a live
rebuild, and bun's bundler/minifier output is not stable across bun
versions. Bump the pin only together with the local bun upgrade that
regenerates those committed files -- never on its own.

`packages/tui-kit` exports `dist/`, not source. Its `build` runs before any
board or deck task through turbo's `^build` dependency, so nothing has to
be built by hand first.
```

- [ ] **Step 2: Rewrite AGENTS.md "Per-app root scripts"**

Replace the paragraph under `### Per-app root scripts` with:

```markdown
### Per-app root scripts

Each app gets `<app>:typecheck`, `<app>:test`, `<app>:lint`, and
`<app>:build` root scripts in `package.json` where that gate applies to
the app (e.g. board has no `:lint` script). Each is
`scripts/turbo.sh <task> --filter=<package>`, so it builds what the app
depends on and caches the result. Run an app's own gates with these rather
than `cd`-ing into `apps/<name>` by hand; they match what CI runs.
```

- [ ] **Step 3: Update README.md**

Line 84 to 85: replace "so workspace consumers run `bun run tui-kit:build` before any board or deck work" with "which turbo builds before any board or deck task (`^build`)".

The clone block: replace `$ bun run test                # vitest across packages/ui + packages/server` with `$ bun run check               # every gate CI runs, cached and parallel`, and the sentence after it with: "`bun run test`, `bun run typecheck` and `bun run lint` run those tasks across every package through turbo; `bun run chat:test` and friends scope one app."

Contributing bullet: replace the long command list with "`bun run check` is exactly what CI runs (`.github/workflows/ci.yml`); run it before opening a pull request."

- [ ] **Step 4: Run the gates that read these files, then commit**

Run: `bun run format && scripts/turbo.sh format:check purity --filter=//`
Expected: both tasks succeed.

```bash
git add AGENTS.md README.md
git commit -m "docs: describe the turbo-backed gates and cache

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: PR and acceptance measurements

**Files:** none (GitHub only).

- [ ] **Step 1: Wait for MANKIT-3, then rebase**

MANKIT-3 (the `TimedRingProgress` real-timer flake) must be on `main` first. Then:

```bash
git fetch origin && git rebase origin/main
bun install && git diff --exit-code -- bun.lock
bun run check
```

Expected: rebase clean, lockfile unchanged, `check` green.

- [ ] **Step 2: Open the PR**

Push `turbo-ci` and open a PR against `main` titled `MANKIT-4: run every gate through turbo, affected-only on PRs`. Body: two framing sentences, a `What changed` list of one-clause bullets, the old-step-to-task table from Task 5, and a `Verification` line quoting the two `check` runs from Task 4 step 6. End with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Record the cold full run**

The PR's first `checks` run has no cache and touches the root, so `--affected` selects everything: this is the cold measurement. Record the job's wall time from `gh run view <id> --json jobs`. Expected: under 4 min.

- [ ] **Step 4: Merge, then record the warm main run**

After review and a green run, merge (with Matt's confirmation). The push to `main` restores the PR's cache. Record its `Cached: N cached, M total` lines from the job log. Expected: at least 80% cached.

- [ ] **Step 5: Record a board-only PR**

Open a throwaway PR from a branch with one whitespace change under `apps/board/src/`, wait for `checks`, record its wall time, then close it. Expected: under 2 min, and the log shows only board's tasks plus the root-side invocation.

- [ ] **Step 6: Close the ticket**

Paste the three numbers into MANKIT-4 and mark it Done. If any target is missed, leave the ticket open with the number and the likely cause (cache restore size, an undeclared input forcing a miss, or serve-check time).
