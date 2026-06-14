#!/usr/bin/env node
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
  if (isGitRepo(root)) {
    repos.push({ path: root, name: path.basename(root) });
  }
  if (depth <= 0) return repos;

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (!entry.isDirectory()) continue;
      const sub = path.join(root, entry.name);
      repos.push(...resolveRepos(sub, depth - 1));
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
  const remote = runGit('remote get-url origin', repoPath);

  return {
    path: repoPath,
    branch: branch.ok ? branch.out : '(detached)',
    commit: commit.ok ? commit.out : '-',
    date: date.ok ? date.out : '-',
    message: message.ok ? message.out : '-',
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : 0,
    ahead: ahead.ok ? parseInt(ahead.out, 10) : 0,
    behind: behind.ok ? parseInt(behind.out, 10) : 0,
    remote: remote.ok ? remote.out : '-',
  };
}

function batchFetch(repos) {
  return repos.map(r => {
    const res = runGit('fetch --all --prune', r.path, { timeout: 30000 });
    return { ...r, result: res.ok ? 'fetched' : res.out };
  });
}

function batchPull(repos, rebase = false) {
  return repos.map(r => {
    const flag = rebase ? '--rebase' : '--ff-only';
    const res = runGit(`pull ${flag}`, r.path, { timeout: 30000 });
    return { ...r, result: res.ok ? 'pulled' : res.out };
  });
}

function batchPush(repos) {
  return repos.map(r => {
    const res = runGit('push', r.path, { timeout: 30000 });
    return { ...r, result: res.ok ? 'pushed' : res.out };
  });
}

function batchStatus(repos) {
  return repos.map(r => ({
    ...getRepoInfo(r.path),
    name: r.name,
  }));
}

function batchCheckout(repos, branch, create = false) {
  return repos.map(r => {
    const flag = create ? '-b' : '';
    const res = runGit(`checkout ${flag} ${branch}`, r.path);
    return { ...r, result: res.ok ? `checked out ${branch}` : res.out };
  });
}

function batchExec(repos, command) {
  return repos.map(r => {
    const res = runGit(command, r.path, { timeout: 30000 });
    return { ...r, result: res.out };
  });
}

function batchStash(repos, pop = false) {
  return repos.map(r => {
    const cmd = pop ? 'stash pop' : 'stash';
    const res = runGit(cmd, r.path);
    return { ...r, result: res.ok ? res.out || (pop ? 'stash restored' : 'stashed') : res.out };
  });
}

function formatStatusText(results) {
  const lines = [];
  for (const r of results) {
    const dirty = r.dirty > 0 ? ` (${r.dirty} changes)` : '';
    const sync = [];
    if (r.ahead > 0) sync.push(`${r.ahead}↑`);
    if (r.behind > 0) sync.push(`${r.behind}↓`);
    const syncStr = sync.length ? ` ${sync.join(' ')}` : '';
    lines.push(`${r.name}  ${r.branch} @ ${r.commit}${dirty}${syncStr}`);
    lines.push(`  ${r.message} (${r.date})`);
  }
  return lines.join('\n');
}

function formatResultText(results) {
  const lines = [];
  for (const r of results) {
    const ok = typeof r.result === 'string' && !r.result.includes('error') && !r.result.includes('fatal');
    const icon = ok ? '✓' : '✗';
    lines.push(`${icon} ${r.name}: ${r.result}`);
  }
  return lines.join('\n');
}

function formatJSON(data) {
  return JSON.stringify(data, null, 2);
}

function formatMarkdown(results, title) {
  const lines = [`# ${title}`, ''];
  for (const r of results) {
    lines.push(`## ${r.name}`, '');
    if (r.branch !== undefined) {
      lines.push(`- **Branch:** ${r.branch}`);
      lines.push(`- **Commit:** ${r.commit} — ${r.message}`);
      lines.push(`- **When:** ${r.date}`);
      if (r.dirty > 0) lines.push(`- **Changes:** ${r.dirty} uncommitted`);
      if (r.ahead > 0) lines.push(`- **Ahead:** ${r.ahead}`);
      if (r.behind > 0) lines.push(`- **Behind:** ${r.behind}`);
    } else {
      lines.push(`- **Result:** ${r.result}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { command: null, flags: {}, positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { args.flags.help = true; continue; }
    if (a === '--json' || a === '-j') { args.flags.json = true; continue; }
    if (a === '--markdown' || a === '-m') { args.flags.markdown = true; continue; }
    if (a === '--depth' || a === '-d') { args.flags.depth = parseInt(argv[++i], 10); continue; }
    if (a === '--dir') { args.flags.dir = argv[++i]; continue; }
    if (a === '--create' || a === '-c') { args.flags.create = true; continue; }
    if (a === '--rebase' || a === '-r') { args.flags.rebase = true; continue; }
    if (a === '--pop') { args.flags.pop = true; continue; }
    if (a === '--exec' || a === '-e') { args.flags.exec = argv[++i]; continue; }
    if (a.startsWith('-')) { args.flags[a] = true; continue; }
    if (!args.command) args.command = a;
    else args.positional.push(a);
  }
  return args;
}

function showHelp() {
  console.log(`git-batch — Run git operations across multiple repos at once

USAGE
  git-batch <command> [options]

COMMANDS
  status     Show branch, commit, sync status for all repos
  fetch      git fetch --all --prune across repos
  pull       git pull (--ff-only) across repos
  push       git push across repos
  checkout   Switch branch across repos
  stash      git stash across repos
  exec       Run arbitrary git command across repos

OPTIONS
  --dir <path>     Root directory to scan (default: .)
  --depth <n>      How deep to scan for repos (default: 1)
  --json, -j       JSON output
  --markdown, -m   Markdown output
  --rebase, -r     Use --rebase with pull
  --create, -c     Create branch with checkout
  --pop            Pop stash instead of creating one
  --exec <cmd>     Git command to run (for exec)
  --help, -h       Show this help

EXAMPLES
  git-batch status
  git-batch status --dir ~/projects --depth 2 --json
  git-batch fetch --dir ~/work
  git-batch pull --rebase
  git-batch checkout main
  git-batch checkout -c feature-x
  git-batch stash
  git-batch stash --pop
  git-batch exec --exec "log -1 --oneline"
  git-batch push`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.flags.help || !args.command) {
    showHelp();
    process.exit(0);
  }

  const root = path.resolve(args.flags.dir || '.');
  const depth = args.flags.depth ?? 1;
  const repos = resolveRepos(root, depth);

  if (repos.length === 0) {
    console.error(`No git repos found in ${root} (depth=${depth})`);
    process.exit(1);
  }

  let results;
  let opName = args.command;

  switch (args.command) {
    case 'status':
      results = batchStatus(repos);
      break;
    case 'fetch':
      results = batchFetch(repos);
      break;
    case 'pull':
      results = batchPull(repos, args.flags.rebase);
      break;
    case 'push':
      results = batchPush(repos);
      break;
    case 'checkout':
      if (args.positional.length === 0) {
        console.error('Usage: git-batch checkout <branch>');
        process.exit(1);
      }
      results = batchCheckout(repos, args.positional[0], args.flags.create);
      break;
    case 'stash':
      results = batchStash(repos, args.flags.pop);
      break;
    case 'exec':
      if (!args.flags.exec) {
        console.error('Usage: git-batch exec --exec "<git command>"');
        process.exit(1);
      }
      results = batchExec(repos, args.flags.exec);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      process.exit(1);
  }

  if (args.flags.json) {
    console.log(formatJSON(results));
  } else if (args.flags.markdown) {
    console.log(formatMarkdown(results, `git-batch ${opName}`));
  } else if (args.command === 'status') {
    console.log(formatStatusText(results));
  } else {
    console.log(formatResultText(results));
  }
}

main();
