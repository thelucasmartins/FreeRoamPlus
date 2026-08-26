#!/usr/bin/env node
// WorktreeRemove hook — pairs with worktree-create.js. Claude Code ignores
// this hook's exit code and output entirely (failures land in debug logs
// only, per https://code.claude.com/docs/en/hooks#worktreecreate) — it
// exists purely so the D:\Claude-worktrees directories this repo's
// worktree-create.js hook makes actually get cleaned up, since Claude Code
// no longer knows how to remove them itself once a WorktreeCreate hook has
// replaced its default git-worktree logic.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKTREE_BASE = 'D:\\Claude-worktrees';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function main() {
  const raw = readStdin();
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch (err) {
    return; // nothing usable to act on — see file header, failures here are non-fatal
  }

  // Prefer an explicit worktree path if the hook input carries one; cwd is
  // the documented fallback (the worktree root, per the WorktreeCreate note
  // in docs/en/worktrees.md). Recompute from `name` too, as a last resort,
  // in case neither path field is present for this event.
  let targetDir = input.cwd || input.worktree_path || input.path || null;
  if (!targetDir && input.name) {
    targetDir = path.join(WORKTREE_BASE, input.name);
  }
  if (!targetDir) return;

  targetDir = path.resolve(targetDir);
  const normalizedBase = path.resolve(WORKTREE_BASE) + path.sep;
  if (!(targetDir + path.sep).startsWith(normalizedBase)) {
    // Not one of ours (e.g. a worktree from a different hook/repo) — leave
    // it alone rather than guess.
    return;
  }

  let repoRoot;
  try {
    repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd()).replace(/\//g, path.sep);
  } catch (err) {
    return;
  }

  // worktree-create.js always names the directory after the worktree and
  // the branch worktree-<name> (see its own comments) — deriving both from
  // targetDir's basename instead of querying `git worktree list --porcelain`
  // first avoids an extra git subprocess touching the same
  // .git/worktrees/<name> folder right before the remove call below, which
  // was observed to make the Windows file-lock issue described there more
  // likely, not less.
  const worktreeName = path.basename(targetDir);
  const branchName = `worktree-${worktreeName}`;

  // `git worktree remove` on Windows can fail with EPERM deleting its own
  // internal .git/worktrees/<name> bookkeeping folder even though the
  // actual worktree checkout is removed and deregistered — a transient
  // file-lock issue (antivirus/indexer), confirmed happening here. One
  // retry after a short pause clears most of these; `worktree prune`
  // afterward cleans up whatever stale admin state is left either way.
  let removeFailed = false;
  try {
    git(['worktree', 'remove', '--force', targetDir], repoRoot);
  } catch (err) {
    removeFailed = true;
  }
  if (removeFailed) {
    try {
      execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 800)'], { timeout: 2000 });
    } catch (err) {
      // ignore — the delay is a best-effort courtesy, not load-bearing
    }
    try {
      git(['worktree', 'remove', '--force', targetDir], repoRoot);
      removeFailed = false;
    } catch (err) {
      // still failing — worktree prune below is the last resort
    }
  }
  try {
    git(['worktree', 'prune'], repoRoot);
  } catch (err) {
    // non-fatal
  }
  if (removeFailed && fs.existsSync(targetDir)) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (err2) {
      // nothing more to do — non-fatal per the file header
    }
  }

  // git's own unlink of .git/worktrees/<name> fails with EPERM on this
  // machine (OneDrive holding handles inside .git — confirmed: both
  // `worktree remove` and `worktree prune` report "failed to delete ...
  // Permission denied" while a plain recursive delete succeeds), so stale
  // metadata folders would otherwise accumulate forever. Only safe to
  // delete once the actual checkout on D: is gone — a live worktree's
  // metadata must never be touched.
  const metaDir = path.join(repoRoot, '.git', 'worktrees', worktreeName);
  if (!fs.existsSync(targetDir) && fs.existsSync(metaDir)) {
    try {
      fs.rmSync(metaDir, { recursive: true, force: true });
    } catch (err) {
      // non-fatal — the next prune/remove cycle can retry
    }
  }

  if (branchName) {
    try {
      git(['branch', '-D', branchName], repoRoot);
    } catch (err) {
      // branch may already be gone, or still checked out elsewhere — fine
    }
  }
}

main();
