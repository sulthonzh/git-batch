'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function runGit(args, cwd, opts = {}) {
  try {
    const result = execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: opts.timeout || 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, out: result.trim() };
  } catch (e) {
    return { ok: false, out: (e.stderr || e.stdout || e.message).trim() };
  }
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function resolveRepos(root, depth = 1) {
  const repos = [];
  if (isGitRepo(root)) repos.push({ path: root, name: path.basename(root) });
  if (depth <= 0) return repos;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (!entry.isDirectory()) continue;
      repos.push(...resolveRepos(path.join(root, entry.name), depth - 1));
    }
  } catch (_) {}
  return repos;
}

function getRepoInfo(repoPath) {
  const branch = runGit('rev-parse --abbrev-ref HEAD', repoPath);
  const commit = runGit('log -1 --format=%h', repoPath);
  const date = runGit('log -1 --format=%ar', repoPath);
  const message = runGit('log -1 --format=%s', repoPath);
  const dirty = runGit('status --porcelain', repoPath);
  const ahead = runGit('rev-list --count @{upstream}..HEAD', repoPath);
  const behind = runGit('rev-list --count HEAD..@{upstream}', repoPath);
  return {
    path: repoPath,
    branch: branch.ok ? branch.out : '(detached)',
    commit: commit.ok ? commit.out : '-',
    date: date.ok ? date.out : '-',
    message: message.ok ? message.out : '-',
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : 0,
    ahead: ahead.ok ? parseInt(ahead.out, 10) : 0,
    behind: behind.ok ? parseInt(behind.out, 10) : 0,
  };
}

function batchFetch(repos) {
  return repos.map(r => {
    const res = runGit('fetch --all --prune', r.path, { timeout: 30000 });
    return { name: r.name, path: r.path, result: res.ok ? 'fetched' : res.out };
  });
}

function batchPull(repos, rebase = false) {
  return repos.map(r => {
    const flag = rebase ? '--rebase' : '--ff-only';
    const res = runGit(`pull ${flag}`, r.path, { timeout: 30000 });
    return { name: r.name, path: r.path, result: res.ok ? 'pulled' : res.out };
  });
}

function batchPush(repos) {
  return repos.map(r => {
    const res = runGit('push', r.path, { timeout: 30000 });
    return { name: r.name, path: r.path, result: res.ok ? 'pushed' : res.out };
  });
}

function batchStatus(repos) {
  return repos.map(r => ({ ...getRepoInfo(r.path), name: r.name }));
}

function batchCheckout(repos, branch, create = false) {
  return repos.map(r => {
    const flag = create ? '-b' : '';
    const res = runGit(`checkout ${flag} ${branch}`, r.path);
    return { name: r.name, path: r.path, result: res.ok ? `checked out ${branch}` : res.out };
  });
}

function batchStash(repos, pop = false) {
  return repos.map(r => {
    const cmd = pop ? 'stash pop' : 'stash';
    const res = runGit(cmd, r.path);
    return { name: r.name, path: r.path, result: res.ok ? (res.out || (pop ? 'stash restored' : 'stashed')) : res.out };
  });
}

function batchExec(repos, command) {
  return repos.map(r => {
    const res = runGit(command, r.path, { timeout: 30000 });
    return { name: r.name, path: r.path, result: res.ok ? res.out : res.out };
  });
}

module.exports = {
  runGit,
  isGitRepo,
  resolveRepos,
  getRepoInfo,
  batchFetch,
  batchPull,
  batchPush,
  batchStatus,
  batchCheckout,
  batchStash,
  batchExec,
};
