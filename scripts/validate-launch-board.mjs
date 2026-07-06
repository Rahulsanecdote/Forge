#!/usr/bin/env node
// Validates .ops/launch-board.json against the board's structural rules.
// Fails (exit 1) on any violation — wired into CI as a verification gate.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const board = JSON.parse(readFileSync(join(root, '.ops/launch-board.json'), 'utf8'));

const errors = [];
const laneIds = new Set(board.lanes.map((l) => l.id));

if (!laneIds.has(board.activeLane)) {
  errors.push(`activeLane "${board.activeLane}" is not a defined lane`);
}

if (board.policies?.singleActiveLane) {
  const active = board.lanes.filter((l) => l.status === 'active');
  if (active.length !== 1) {
    errors.push(`singleActiveLane policy: expected 1 active lane, found ${active.length}`);
  }
}

const approvalTypes = new Set(board.policies?.humanApprovalRequiredFor ?? []);
const badEvidence = /^(looks good|probably fixed|should work|done)\.?$/i;

for (const b of board.blockers) {
  if (!laneIds.has(b.lane)) errors.push(`blocker "${b.id}": unknown lane "${b.lane}"`);
  if (!Array.isArray(b.definitionOfDone) || b.definitionOfDone.length === 0) {
    errors.push(`blocker "${b.id}": definitionOfDone must be a non-empty list`);
  }
  if (approvalTypes.has(b.type) && b.requiresHumanApproval !== true) {
    errors.push(`blocker "${b.id}": type "${b.type}" requires requiresHumanApproval: true`);
  }
  for (const e of b.evidence ?? []) {
    if (typeof e.description === 'string' && badEvidence.test(e.description.trim())) {
      errors.push(`blocker "${b.id}": evidence "${e.description}" is not real evidence`);
    }
  }
  if (board.policies?.terminalEvidenceRequired && b.status === 'shipped' && (b.evidence ?? []).length === 0) {
    errors.push(`blocker "${b.id}": shipped without evidence (terminalEvidenceRequired)`);
  }
}

if (errors.length) {
  console.error('launch-board validation FAILED:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`launch-board OK — ${board.blockers.length} blockers across ${board.lanes.length} lanes.`);
