#!/usr/bin/env node
// Prints the launch board: lanes, blockers, and definition-of-done progress.
// Usage: npm run launch:status

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const boardPath = join(dirname(fileURLToPath(import.meta.url)), 'launch-board.json');
const board = JSON.parse(readFileSync(boardPath, 'utf8'));

console.log(`\n${board.project} — launch board (active lane: ${board.activeLane})\n`);

for (const lane of board.lanes) {
  const blockers = board.blockers.filter((b) => b.lane === lane.id);
  const marker = lane.status === 'active' ? '●' : '○';
  console.log(`${marker} [${lane.status.toUpperCase()}] ${lane.title} (phase ${lane.phase})`);

  for (const b of blockers) {
    const done = b.definitionOfDone.filter((d) => d.done).length;
    const total = b.definitionOfDone.length;
    console.log(`    ${b.priority} ${b.title} — ${b.status} (${done}/${total} done)`);
    for (const d of b.definitionOfDone) {
      console.log(`       ${d.done ? '[x]' : '[ ]'} ${d.item}`);
    }
  }
}

const open = board.blockers.filter((b) => !['shipped', 'closed'].includes(b.status));
console.log(`\n${open.length} open blocker(s).\n`);
