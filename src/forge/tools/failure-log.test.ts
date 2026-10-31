import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFailureDigest, buildFailureRow, countRepeats, type FailureRow } from './failure-log';

const CLIENT = 'client-a';
const OTHER = 'client-b';

function row(partial: Partial<FailureRow>): FailureRow {
  return {
    client_id: CLIENT,
    task: 'Morning digest',
    did: 'Reported counts from a partial list page',
    should_have: 'Paginated to exhaustion and cross-checked the count',
    caught_by: 'operator',
    severity: 'P2',
    root_cause_class: 'unverified-count',
    fix_ref: null,
    rule_created: null,
    created_at: '2026-10-05T12:00:00Z',
    ...partial,
  };
}

test('buildFailureRow maps tool input to the stored row shape, scoped to the client', () => {
  const built = buildFailureRow(
    {
      task: 'Draft posts',
      did: 'Invented a follower count',
      shouldHave: 'Report only provided metrics',
      caughtBy: 'operator',
      severity: 'P1',
      rootCauseClass: 'fabricated-metric',
    },
    CLIENT,
  );
  assert.equal(built.client_id, CLIENT);
  assert.equal(built.should_have, 'Report only provided metrics');
  assert.equal(built.fix_ref, null);
  assert.equal(built.rule_created, null);
});

test('countRepeats counts the new failure for its class only', () => {
  const existing = [
    row({ root_cause_class: 'unverified-count' }),
    row({ root_cause_class: 'unverified-count' }),
    row({ root_cause_class: 'stale-source' }),
  ];
  assert.equal(countRepeats(existing, 'unverified-count'), 3);
  assert.equal(countRepeats(existing, 'stale-source'), 2);
  assert.equal(countRepeats(existing, 'new-class'), 1);
});

test('digest counts by severity and class, and surfaces unconverted P1s', () => {
  const rows = [
    row({ severity: 'P1', root_cause_class: 'fabricated-metric' }),
    row({ severity: 'P2' }),
    row({ severity: 'P1', root_cause_class: 'fabricated-metric', rule_created: 'Never invent metrics' }),
  ];
  const digest = buildFailureDigest(rows, CLIENT);
  assert.equal(digest.total, 3);
  assert.deepEqual(digest.bySeverity, { P1: 2, P2: 1, P3: 0 });
  assert.equal(digest.byRootCauseClass['unverified-count'], 1);
  assert.equal(digest.unconvertedP1.length, 1);
});

test('digest proposes candidate rules for P1s and repeated classes, never for converted ones', () => {
  const rows = [
    row({ severity: 'P1', root_cause_class: 'fabricated-metric', should_have: 'Report only provided metrics' }),
    row({ severity: 'P3', root_cause_class: 'stale-source' }),
    row({ severity: 'P3', root_cause_class: 'stale-source' }),
    row({ severity: 'P1', root_cause_class: 'converted-class', rule_created: 'Already a rule' }),
    row({ severity: 'P3', root_cause_class: 'one-off' }),
  ];
  const digest = buildFailureDigest(rows, CLIENT);
  const classes = digest.candidateRules.map((c) => c.rootCauseClass).sort();
  assert.deepEqual(classes, ['fabricated-metric', 'stale-source']);
  const fabricated = digest.candidateRules.find((c) => c.rootCauseClass === 'fabricated-metric');
  assert.match(fabricated?.draftRule ?? '', /Report only provided metrics/);
  const stale = digest.candidateRules.find((c) => c.rootCauseClass === 'stale-source');
  assert.equal(stale?.repeatCount, 2);
});

test('digest never includes another client\u2019s failures', () => {
  const rows = [
    row({ severity: 'P1' }),
    row({ client_id: OTHER, severity: 'P1', root_cause_class: 'other-class' }),
    row({ client_id: OTHER, severity: 'P1', root_cause_class: 'other-class' }),
  ];
  const digest = buildFailureDigest(rows, CLIENT);
  assert.equal(digest.total, 1);
  assert.equal(digest.byRootCauseClass['other-class'], undefined);
  assert.equal(digest.candidateRules.length, 1);
});

test('period filter limits counts to the month, but repeat counts span all rows', () => {
  const rows = [
    row({ root_cause_class: 'stale-source', created_at: '2026-09-14T09:00:00Z' }),
    row({ root_cause_class: 'stale-source', created_at: '2026-10-02T09:00:00Z' }),
  ];
  const digest = buildFailureDigest(rows, CLIENT, '2026-10');
  assert.equal(digest.period, '2026-10');
  assert.equal(digest.total, 1);
  // One in-period row, but the class total is 2, so it is promotable.
  assert.equal(digest.candidateRules.length, 1);
  assert.equal(digest.candidateRules[0].repeatCount, 2);
});
