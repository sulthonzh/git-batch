#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const {
  runGit, isGitRepo, resolveRepos, getRepoInfo,
  batchFetch, batchPull, batchPush, batchStatus,
  batchCheckout, batchStash, batchExec,
} = require('../src/index');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

// ── Create temp git repos for testing ────────────────────────────────
const tmpRoot = path.join(os.tmpdir(), `git-batch-test-${Date.now()}`);
fs.mkdirSync(tmpRoot, { recursive: true });

function makeRepo(name) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  exec(`git init`, dir);
  exec(`git config user.email "test@test.com"`, dir);
  exec(`git config user.name "Test"`, dir);
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}`);
  exec(`git add .`, dir);
  exec(`git commit -m "init ${name}"`, dir);
  return dir;
}

function exec(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8' });
}

try {
  console.log('git-batch test suite\n');

  // Setup: 3 repos
  const repoA = makeRepo('project-a');
  const repoB = makeRepo('project-b');
  fs.mkdirSync(path.join(tmpRoot, 'nested'), { recursive: true });
  const repoC = makeRepo('nested/project-c');

  // ── isGitRepo ──────────────────────────────────────────────────
  console.log('isGitRepo');
  assert(isGitRepo(repoA), 'detects git repo');
  assert(!isGitRepo(tmpRoot), 'non-repo dir returns false');
  assert(!isGitRepo('/nonexistent'), 'missing dir returns false');

  // ── resolveRepos ───────────────────────────────────────────────
  console.log('resolveRepos');
  const found = resolveRepos(tmpRoot, 2);
  assert(found.length === 3, `found 3 repos (got ${found.length})`);
  const names = found.map(r => r.name).sort();
  assert(names.includes('project-a'), 'found project-a');
  assert(names.includes('project-b'), 'found project-b');
  assert(names.includes('project-c'), 'found nested project-c');

  const shallow = resolveRepos(tmpRoot, 0);
  assert(shallow.length === 0, 'depth 0 finds no subdirs (root is not a repo)');

  // ── getRepoInfo ────────────────────────────────────────────────
  console.log('getRepoInfo');
  const info = getRepoInfo(repoA);
  assert(info.branch === 'master' || info.branch === 'main', `branch is master/main (got ${info.branch})`);
  assert(info.commit.length >= 7, `commit hash present (${info.commit})`);
  assert(info.message === 'init project-a', `commit message correct (${info.message})`);
  assert(info.dirty === 0, 'clean repo has 0 changes');

  // Make it dirty
  fs.writeFileSync(path.join(repoA, 'new.txt'), 'hello');
  const dirtyInfo = getRepoInfo(repoA);
  assert(dirtyInfo.dirty === 1, `dirty repo detected (got ${dirtyInfo.dirty})`);

  // ── batchStatus ────────────────────────────────────────────────
  console.log('batchStatus');
  const repos = resolveRepos(tmpRoot, 2);
  const statuses = batchStatus(repos);
  assert(statuses.length === 3, '3 statuses');
  assert(statuses[0].name !== undefined, 'has name');
  assert(statuses[0].branch !== undefined, 'has branch');

  // ── batchFetch ────────────────────────────────────────────────
  console.log('batchFetch');
  const fetched = batchFetch(repos);
  assert(fetched.length === 3, '3 fetch results');
  // No remotes, so fetch will fail but we handle it
  fetched.forEach(r => assert(r.result !== undefined, `${r.name} has result`));

  // ── batchCheckout ─────────────────────────────────────────────
  console.log('batchCheckout');
  const checked = batchCheckout(repos.slice(0, 2), 'test-branch', true);
  assert(checked.length === 2, '2 checkout results');
  checked.forEach(r => assert(r.result.includes('test-branch'), `${r.name} checked out`));

  // Switch back
  batchCheckout(repos.slice(0, 2), exec('git rev-parse --abbrev-ref HEAD', repoA).trim() === 'test-branch' ? 'master' : 'main');

  // ── batchStash ────────────────────────────────────────────────
  console.log('batchStash');
  // repoA still has uncommitted new.txt
  const stashed = batchStash(repos);
  assert(stashed.length === 3, '3 stash results');
  const stashA = stashed.find(r => r.name === 'project-a');
  assert(stashA && (stashA.result.includes('stash') || stashA.result.includes('Saved') || stashA.result.includes('No local')), 'project-a stashed');

  // Pop it back
  const popped = batchStash(repos, true);
  assert(popped.length === 3, '3 pop results');

  // ── batchExec ─────────────────────────────────────────────────
  console.log('batchExec');
  const logResults = batchExec(repos, 'log -1 --oneline');
  assert(logResults.length === 3, '3 exec results');
  logResults.forEach(r => assert(r.result.includes('init'), `${r.name}: ${r.result}`));

  // ── batchPull / batchPush (no remotes, expect errors) ─────────
  console.log('batchPull/Push (no remotes)');
  const pulled = batchPull(repos);
  assert(pulled.length === 3, '3 pull results');
  pulled.forEach(r => assert(r.result !== undefined, `${r.name} has pull result`));

  const pushed = batchPush(repos);
  assert(pushed.length === 3, '3 push results');
  pushed.forEach(r => assert(r.result !== undefined, `${r.name} has push result`));

  // ── runGit helper ─────────────────────────────────────────────
  console.log('runGit');
  const good = runGit('status', repoA);
  assert(good.ok === true, 'git status succeeds');
  assert(good.out.length > 0, 'has output');

  const bad = runGit('invalid-command-xyz', repoA);
  assert(bad.ok === false, 'invalid command returns ok=false');
  assert(bad.out.length > 0, 'has error output');

  // ── Summary ───────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
} finally {
  // Cleanup
  try { fs.rmSync(tmpRoot, { recursive: true }); } catch (_) {}
}
