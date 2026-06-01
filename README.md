# git-batch

Run git operations across multiple repos at once. Zero dependencies.

You know the drill — you've got 15 repos cloned locally and you need to pull them all. Or check which ones have uncommitted changes. Or switch to `main` across the board. Instead of writing a bash loop (again), just use `git-batch`.

## Install

```bash
npm install -g git-batch
```

## Commands

| Command | What it does |
|---------|-------------|
| `status` | Show branch, commit, sync status for all repos |
| `fetch` | `git fetch --all --prune` across repos |
| `pull` | `git pull --ff-only` across repos |
| `push` | `git push` across repos |
| `checkout` | Switch (or create) branch across repos |
| `stash` | Stash or pop changes across repos |
| `exec` | Run any git command across repos |

## Usage

### See what's going on across all your repos

```bash
git-batch status
```

Output:
```
my-app  main @ a3f2c1d
  Add auth middleware (2 hours ago)
api-server  feature/login @ b7e4a2f (3 changes) 2↑ 1↓
  WIP: login endpoint (45 minutes ago)
shared-lib  main @ c9d1e3a
  Bump dependencies (1 day ago)
```

### Pull everything

```bash
git-batch pull
```

### Pull with rebase

```bash
git-batch pull --rebase
```

### Check a specific directory

```bash
git-batch status --dir ~/projects --depth 2
```

### Create and switch to a new branch everywhere

```bash
git-batch checkout -c feature/new-thing
```

### Stash dirty changes before switching

```bash
git-batch stash
git-batch checkout main
git-batch stash --pop
```

### Run any git command

```bash
git-batch exec --exec "log -1 --oneline"
git-batch exec --exec "remote -v"
git-batch exec --exec "tag -l 'v1.*'"
```

### JSON output (for scripts/CI)

```bash
git-batch status --json
```

### Markdown output

```bash
git-batch status --markdown
```

## Options

| Flag | Description |
|------|-------------|
| `--dir <path>` | Root directory to scan (default: `.`) |
| `--depth <n>` | How deep to scan for repos (default: `1`) |
| `--json`, `-j` | JSON output |
| `--markdown`, `-m` | Markdown output |
| `--rebase`, `-r` | Use `--rebase` with pull |
| `--create`, `-c` | Create branch with checkout |
| `--pop` | Pop stash instead of creating one |
| `--exec <cmd>` | Git command to run (for exec) |

## Programmatic API

```js
const { resolveRepos, batchStatus, batchPull } = require('git-batch');

const repos = resolveRepos('/home/user/projects', 2);
const statuses = batchStatus(repos);

for (const repo of statuses) {
  console.log(`${repo.name}: ${repo.branch} (${repo.dirty} changes)`);
}
```

### API

- `resolveRepos(root, depth)` — Find git repos under a directory
- `batchStatus(repos)` — Get branch/commit/dirty/sync info
- `batchFetch(repos)` — Fetch all remotes
- `batchPull(repos, rebase?)` — Pull with ff-only or rebase
- `batchPush(repos)` — Push to remotes
- `batchCheckout(repos, branch, create?)` — Switch/create branches
- `batchStash(repos, pop?)` — Stash or pop changes
- `batchExec(repos, command)` — Run arbitrary git command
- `getRepoInfo(repoPath)` — Get info for a single repo

## Why

I got tired of writing `for dir in */; do cd "$dir" && git pull && cd ..; done` every morning. This does that, plus shows you what's dirty, what's behind, and lets you run any git command across all your repos in one shot.

Zero dependencies because it's just `child_process` and `fs`. Works with Node 16+.

## License

MIT
