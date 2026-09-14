#!/usr/bin/env node
/**
 * claude-check — Claude Code PostToolUse hook for this repo.
 *
 * After every Edit/Write (and after Bash commands that can change code) it
 * checks the WHOLE codebase for breakage and, only when something is broken,
 * reports it back to Claude:
 *
 *   tsc     whole-project typecheck (incremental, so ~3-8 s after the first run)
 *   eslint  the files that changed
 *   jest    the tests related to the changed files (pure-logic dirs only)
 *
 * Wired with `asyncRewake` in ~/.claude/settings.json, so it never blocks the
 * next tool call: it runs in the background and exit code 2 + a report on
 * stderr wakes the model with the findings. Clean = silent, exit 0.
 *
 * Scope: acts only on paths under a *fitai-pro-app* checkout (main tree or a
 * worktree). Anything else — other projects, node_modules, android/, the Deno
 * edge functions (not covered by this tsconfig) — exits 0 without running.
 *
 * Safety valves:
 *   - one run at a time per checkout (lock in .claude-check/); an edit that
 *     lands mid-run queues one follow-up run instead of a second tsc.
 *   - skipped entirely while a release build is writing build-evulto.log:
 *     jest + gradle + Metro together have OOM-killed a build before.
 *   - EVULTO_CHECK=0 disables it; EVULTO_CHECK_JEST=0 skips the jest leg.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_MARK = /fitai-pro-app/i;
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const SKIP_DIRS = /[\\/](node_modules|android|ios|\.expo|\.claude-check|supabase[\\/]functions|scripts[\\/]technique-clips[\\/]out|docs)[\\/]/i;
// Pure-logic dirs where a related jest run is cheap and actually has tests.
const JEST_DIRS = /^(lib|constants|hooks|__tests__)[\\/]/i;
// Bash commands that can change source without an Edit/Write event.
const CODE_CHANGING_BASH =
  /\bgit\s+(merge|checkout|switch|stash|rebase|apply|cherry-pick|revert|pull|reset|rm|mv|worktree)\b|\bsed\s+-i\b|\bnode\s+(-e|-)(\s|$)|\bnode\s+\S+\.(js|mjs|cjs)\b|>>?\s*"?[^"\s]+\.(ts|tsx|js|jsx)\b|\b(mv|cp|rm)\s|\bnpm\s+(i|install|ci|uninstall|update|remove)\b/;

const TIMEOUTS = { tsc: 170_000, eslint: 90_000, jest: 150_000 };
const BUILD_ACTIVE_MS = 180_000;
const LOCK_STALE_MS = 6 * 60_000;
const MAX_FILES = 20;

if (process.env.EVULTO_CHECK === '0') process.exit(0);

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

const norm = (p) => (typeof p === 'string' ? p.replace(/\//g, path.sep) : '');

/** Nearest ancestor of `from` holding package.json + tsconfig.json, if it is this repo. */
function findRoot(from) {
  let dir = from;
  for (let i = 0; i < 12 && dir; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'tsconfig.json'))) {
      return REPO_MARK.test(dir) ? dir : null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** { root, files, trigger } or null when this event is none of our business. */
function scopeOf(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};

  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    const file = norm(ti.file_path || ti.notebook_path || (input.tool_response || {}).filePath);
    if (!file || !CODE_FILE.test(file) || SKIP_DIRS.test(file + path.sep)) return null;
    const root = findRoot(path.dirname(file));
    if (!root) return null;
    return { root, files: [path.relative(root, file)], trigger: `editing ${path.relative(root, file)}` };
  }

  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    if (!CODE_CHANGING_BASH.test(cmd)) return null;
    // Where did it run? The command's own path, else the session cwd.
    const m = cmd.match(/([A-Za-z]:[\\/][^"'\s;&|]*fitai-pro-app(?:-wt[\\/][^\\/"'\s;&|]+)?)/i);
    const hint = m ? norm(m[1]) : norm(input.cwd || '');
    if (!REPO_MARK.test(hint)) return null;
    const root = findRoot(hint) || findRoot(path.dirname(hint));
    if (!root) return null;
    return { root, files: changedFiles(root), trigger: `bash: ${cmd.slice(0, 80)}` };
  }
  return null;
}

/** Uncommitted code files (modified + untracked), relative to root. */
function changedFiles(root) {
  const out = new Set();
  for (const args of [['diff', '--name-only', 'HEAD'], ['ls-files', '--others', '--exclude-standard']]) {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15_000 });
    if (r.status !== 0) continue;
    for (const line of r.stdout.split(/\r?\n/)) {
      const f = norm(line.trim());
      if (f && CODE_FILE.test(f) && !SKIP_DIRS.test(path.sep + f + path.sep)) out.add(f);
    }
  }
  return [...out].slice(0, MAX_FILES);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock — one run per checkout; a mid-run edit queues exactly one follow-up.
// ─────────────────────────────────────────────────────────────────────────────

function cacheDir(root) {
  const d = path.join(root, '.claude-check');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function acquireLock(dir, files) {
  const lock = path.join(dir, 'lock');
  const rerun = path.join(dir, 'rerun.json');
  try {
    const cur = JSON.parse(fs.readFileSync(lock, 'utf8'));
    const fresh = Date.now() - cur.at < LOCK_STALE_MS;
    if (fresh && pidAlive(cur.pid)) {
      // Someone is checking right now. Leave our files for their follow-up pass.
      let queued = [];
      try { queued = JSON.parse(fs.readFileSync(rerun, 'utf8')); } catch { /* none */ }
      fs.writeFileSync(rerun, JSON.stringify([...new Set([...queued, ...files])]));
      return false;
    }
  } catch { /* no lock */ }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }));
  return true;
}

function takeRerun(dir) {
  const rerun = path.join(dir, 'rerun.json');
  try {
    const files = JSON.parse(fs.readFileSync(rerun, 'utf8'));
    fs.unlinkSync(rerun);
    return Array.isArray(files) ? files : [];
  } catch {
    return null;
  }
}

function releaseLock(dir) {
  try { fs.unlinkSync(path.join(dir, 'lock')); } catch { /* gone */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Checks
// ─────────────────────────────────────────────────────────────────────────────

function run(root, args, timeout) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  return { ...r, ms: Date.now() - t0, timedOut: r.error && r.error.code === 'ETIMEDOUT' };
}

function checkTsc(root, dir) {
  const r = run(root, [
    'node_modules/typescript/bin/tsc', '--noEmit', '-p', '.', '--pretty', 'false',
    '--incremental', '--tsBuildInfoFile', path.join(dir, 'tsbuildinfo'),
  ], TIMEOUTS.tsc);
  if (r.timedOut) return { ms: r.ms, errors: ['tsc timed out'] };
  const lines = (r.stdout + '\n' + r.stderr).split(/\r?\n/).filter((l) => /\berror TS\d+/.test(l));
  return { ms: r.ms, errors: lines };
}

function checkEslint(root, files) {
  if (files.length === 0) return { ms: 0, errors: [], warnings: 0 };
  const existing = files.filter((f) => fs.existsSync(path.join(root, f)));
  if (existing.length === 0) return { ms: 0, errors: [], warnings: 0 };
  const r = run(root, ['node_modules/eslint/bin/eslint.js', '--format', 'json', ...existing], TIMEOUTS.eslint);
  if (r.timedOut) return { ms: r.ms, errors: ['eslint timed out'], warnings: 0 };
  let results = [];
  try { results = JSON.parse(r.stdout); } catch {
    return { ms: r.ms, errors: r.status ? [(r.stderr || r.stdout).trim().split(/\r?\n/)[0] || 'eslint failed'] : [], warnings: 0 };
  }
  const errors = [];
  let warnings = 0;
  for (const file of results) {
    const rel = path.relative(root, file.filePath);
    for (const m of file.messages) {
      if (m.severity === 2) errors.push(`${rel}:${m.line}:${m.column} ${m.ruleId || 'error'} — ${m.message}`);
      else warnings++;
    }
  }
  return { ms: r.ms, errors, warnings };
}

/**
 * Which test files exercise these source files. jest's own --findRelatedTests
 * cannot answer that here: jest.config.js scopes `roots` to __tests__/, so
 * lib/ is not in its module graph. Every test in this repo imports sources
 * through the `@/` alias, so the import line is the honest, cheap index.
 */
function relatedTests(root, targets) {
  const testDir = path.join(root, '__tests__');
  let testFiles = [];
  try {
    testFiles = fs.readdirSync(testDir).filter((f) => /\.test\.[jt]sx?$/.test(f)).map((f) => path.join('__tests__', f));
  } catch {
    return [];
  }
  const wanted = new Set();
  const moduleIds = [];
  for (const t of targets) {
    if (t.startsWith('__tests__' + path.sep)) { wanted.add(t); continue; }
    const id = t.split(path.sep).join('/').replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '').replace(/\/index$/, '');
    moduleIds.push(id);
  }
  if (moduleIds.length) {
    for (const tf of testFiles) {
      let src = '';
      try { src = fs.readFileSync(path.join(root, tf), 'utf8'); } catch { continue; }
      if (moduleIds.some((id) => src.includes(`'@/${id}'`) || src.includes(`"@/${id}"`))) wanted.add(tf);
    }
  }
  return [...wanted];
}

function checkJest(root, dir, files) {
  if (process.env.EVULTO_CHECK_JEST === '0') return { ms: 0, skipped: 'EVULTO_CHECK_JEST=0' };
  const targets = files.filter((f) => JEST_DIRS.test(f) && fs.existsSync(path.join(root, f)));
  if (targets.length === 0) return { ms: 0, skipped: 'no pure-logic files changed' };
  const tests = relatedTests(root, targets);
  if (tests.length === 0) return { ms: 0, skipped: 'no test imports the changed files' };
  const out = path.join(dir, 'jest.json');
  try { fs.unlinkSync(out); } catch { /* none */ }
  // jest reads these as regex patterns: Windows backslashes are escapes there.
  const posix = tests.map((f) => f.split(path.sep).join('/'));
  const r = run(root, [
    'node_modules/jest-cli/bin/jest.js', '--runTestsByPath', ...posix,
    '--ci', '--silent', '--passWithNoTests', '--json', `--outputFile=${out}`,
  ], TIMEOUTS.jest);
  if (r.timedOut) return { ms: r.ms, failures: ['jest timed out'] };
  let json = null;
  try { json = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* no report */ }
  if (!json) {
    return r.status === 0
      ? { ms: r.ms, failures: [] }
      : { ms: r.ms, failures: [(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-15).join('\n')] };
  }
  const failures = [];
  for (const suite of json.testResults || []) {
    const rel = path.relative(root, suite.name);
    if (suite.status === 'failed' && (suite.assertionResults || []).every((a) => a.status !== 'failed')) {
      failures.push(`${rel}: suite failed to run\n${trim(suite.message, 20)}`);
    }
    for (const a of suite.assertionResults || []) {
      if (a.status !== 'failed') continue;
      failures.push(`${rel} › ${a.fullName}\n${trim((a.failureMessages || []).join('\n'), 25)}`);
    }
  }
  return { ms: r.ms, failures, ran: json.numTotalTests || 0 };
}

// Stack frames inside node_modules are jest's, not ours; the first project
// frame is the one that locates the failing assertion.
const trim = (s, n) =>
  String(s || '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*at .*node_modules/.test(l))
    .slice(0, n)
    .map((l) => '    ' + l)
    .join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

function report(scope, tsc, eslint, jest, totalMs) {
  const broken = tsc.errors.length || eslint.errors.length || (jest.failures || []).length;
  if (!broken) return null;
  const lines = [`EVULTO CHECK — broken after ${scope.trigger}`];
  if (tsc.errors.length) {
    lines.push(`tsc: ${tsc.errors.length} error(s) across the whole project`);
    for (const e of tsc.errors.slice(0, 25)) lines.push('  ' + e);
    if (tsc.errors.length > 25) lines.push(`  … ${tsc.errors.length - 25} more`);
  }
  if (eslint.errors.length) {
    lines.push(`eslint: ${eslint.errors.length} error(s) in changed files`);
    for (const e of eslint.errors.slice(0, 15)) lines.push('  ' + e);
  }
  if ((jest.failures || []).length) {
    lines.push(`jest: ${jest.failures.length} failure(s) in tests related to the changed files`);
    for (const f of jest.failures.slice(0, 4)) lines.push('  ' + f.replace(/\n/g, '\n  '));
  }
  lines.push(`(checked in ${(totalMs / 1000).toFixed(1)}s — tsc ${(tsc.ms / 1000).toFixed(1)}s, eslint ${(eslint.ms / 1000).toFixed(1)}s, jest ${(jest.ms / 1000).toFixed(1)}s${jest.skipped ? `, jest skipped: ${jest.skipped}` : ''})`);
  lines.push('Fix these before moving on, or say why they are expected.');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const input = readStdin();
  const scope = scopeOf(input);
  if (!scope) return 0;

  // A release build is bundling/compiling in this tree: stay out of its memory.
  try {
    const st = fs.statSync(path.join(scope.root, 'build-evulto.log'));
    if (Date.now() - st.mtimeMs < BUILD_ACTIVE_MS) return 0;
  } catch { /* no log */ }

  const dir = cacheDir(scope.root);
  if (!acquireLock(dir, scope.files)) return 0;

  let files = [...scope.files];
  let text = null;
  try {
    for (let pass = 0; pass < 3; pass++) {
      const t0 = Date.now();
      const tsc = checkTsc(scope.root, dir);
      const eslint = checkEslint(scope.root, files);
      const jest = checkJest(scope.root, dir, files);
      text = report(scope, tsc, eslint, jest, Date.now() - t0);
      fs.writeFileSync(path.join(dir, 'last.txt'), `${new Date().toISOString()} ${scope.trigger}\n${text || 'clean'}\n`);
      const more = takeRerun(dir);
      if (!more) break;
      files = [...new Set([...files, ...more])];
      scope.trigger = `${scope.trigger} (+${more.length} more edit(s) during the check)`;
    }
  } finally {
    releaseLock(dir);
  }

  if (!text) return 0;
  process.stderr.write(text + '\n');
  return 2;
}

process.exit(main());
