#!/usr/bin/env node
// WorktreeCreate hook — see ../../lidar-pipeline/README.md's sibling note in
// the root README, or https://code.claude.com/docs/en/hooks#worktreecreate.
//
// C: is nearly full, so this redirects every worktree Claude Code creates
// for this repo (interactive --worktree, subagent isolation: worktree, and
// background sessions) from the default .claude/worktrees/<name>/ (on C:,
// under OneDrive) to WORKTREE_BASE below, on D:. Installing this hook means
// Claude Code's own default git-worktree logic is fully bypassed for this
// repo — this script is now responsible for creating (and, in
// worktree-remove.js, cleaning up) every worktree itself. That means some
// default conveniences no longer apply automatically: PR/MR "#123"
// shortcuts, .worktreeinclude auto-copying gitignored files, and exact
// "fresh vs head" base-ref freshness (a live `git fetch` with a 5s cap) are
// not reimplemented here — this picks the closest local ref instead (see
// resolveBaseRef below) rather than hitting the network on every worktree
// creation.
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

function resolveBaseRef(repoRoot) {
  const candidates = ['origin/HEAD', 'origin/main', 'origin/master'];
  for (const ref of candidates) {
    try {
      git(['rev-parse', '--verify', '--quiet', ref], repoRoot);
      return ref;
    } catch (err) {
      // not present locally — try the next candidate
    }
  }
  return 'HEAD';
}

function main() {
  const raw = readStdin();
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch (err) {
    process.stderr.write(`worktree-create hook: could not parse input JSON: ${err.message}\n`);
    process.exit(1);
  }

  const name = input.name;
  if (!name || typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name)) {
    process.stderr.write(`worktree-create hook: missing or unsafe worktree name in input (got ${JSON.stringify(name)})\n`);
    process.exit(1);
  }

  const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd()).replace(/\//g, path.sep);
  const targetDir = path.join(WORKTREE_BASE, name);

  fs.mkdirSync(WORKTREE_BASE, { recursive: true });

  // Reuse an existing worktree at this path if one is already registered —
  // mirrors the default "reusing a worktree name reopens it" behavior for
  // the simple case, without replicating its reset-to-default-branch rules.
  let alreadyRegistered = false;
  try {
    const list = git(['worktree', 'list', '--porcelain'], repoRoot);
    const normalizedTarget = targetDir.replace(/\\/g, '/');
    alreadyRegistered = list
      .split('\n')
      .some((line) => line.startsWith('worktree ') && line.slice('worktree '.length).replace(/\\/g, '/') === normalizedTarget);
  } catch (err) {
    // git worktree list failing is unexpected but not fatal — fall through
    // and let `git worktree add` itself report the real problem, if any.
  }

  if (alreadyRegistered) {
    process.stdout.write(targetDir + '\n');
    return;
  }

  if (fs.existsSync(targetDir)) {
    process.stderr.write(`worktree-create hook: ${targetDir} already exists and is not a registered git worktree — remove it manually first.\n`);
    process.exit(1);
  }

  const baseRef = resolveBaseRef(repoRoot);
  const branchName = `worktree-${name}`;

  try {
    git(['worktree', 'add', '-b', branchName, targetDir, baseRef], repoRoot);
  } catch (err) {
    // Most likely a leftover branch from a worktree that was removed
    // without its branch being cleaned up (e.g. a crash before
    // worktree-remove.js ran) — -B resets it to baseRef and retries once.
    try {
      git(['worktree', 'add', '-B', branchName, targetDir, baseRef], repoRoot);
    } catch (err2) {
      process.stderr.write(`worktree-create hook: git worktree add failed: ${err2.message}\n`);
      process.exit(1);
    }
  }

  process.stdout.write(targetDir + '\n');
}

main();
