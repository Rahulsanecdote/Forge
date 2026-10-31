// Pure Fleetlog logic — no database, no model. Kept separate from the tool
// wrappers (log-failure.ts / review-failures.ts) so the counting, digest, and
// rule-promotion rules are unit-testable in isolation, mirroring the
// authority-policy.ts / authority.ts split.

export type FailureSeverity = 'P1' | 'P2' | 'P3';

export interface FailureLogInput {
  task: string;
  did: string;
  shouldHave: string;
  caughtBy: string;
  severity: FailureSeverity;
  rootCauseClass: string;
  fixRef?: string;
}

// Shape of a public.failure_log row (snake_case, as stored).
export interface FailureRow {
  id?: string;
  client_id: string;
  task: string;
  did: string;
  should_have: string;
  caught_by: string;
  severity: FailureSeverity;
  root_cause_class: string;
  fix_ref: string | null;
  rule_created: string | null;
  created_at?: string;
}

export function buildFailureRow(input: FailureLogInput, clientId: string): FailureRow {
  return {
    client_id: clientId,
    task: input.task,
    did: input.did,
    should_have: input.shouldHave,
    caught_by: input.caughtBy,
    severity: input.severity,
    root_cause_class: input.rootCauseClass,
    fix_ref: input.fixRef ?? null,
    rule_created: null,
  };
}

// How many failures of this root-cause class exist once the new one is added.
export function countRepeats(
  existing: Pick<FailureRow, 'root_cause_class'>[],
  rootCauseClass: string,
): number {
  return existing.filter((r) => r.root_cause_class === rootCauseClass).length + 1;
}

export interface CandidateRule {
  rootCauseClass: string;
  severity: FailureSeverity;
  repeatCount: number;
  draftRule: string;
}

export interface FailureDigest {
  period: string | null; // 'YYYY-MM' when a period filter was applied, else null
  total: number;
  bySeverity: Record<FailureSeverity, number>;
  byRootCauseClass: Record<string, number>;
  unconvertedP1: FailureRow[];
  candidateRules: CandidateRule[];
}

// A failure is promotable when a human should consider turning it into a rule:
// any P1 that has not produced a rule yet, or a root-cause class that has
// repeated (>= 2) without producing one. Draft rules are templates built from
// the recorded "should have" text — deterministic, never model-invented.
export function buildFailureDigest(
  rows: FailureRow[],
  clientId: string,
  period?: string,
): FailureDigest {
  const mine = rows.filter((r) => r.client_id === clientId);
  const inPeriod = period ? mine.filter((r) => (r.created_at ?? '').startsWith(period)) : mine;

  const bySeverity: Record<FailureSeverity, number> = { P1: 0, P2: 0, P3: 0 };
  const byRootCauseClass: Record<string, number> = {};
  for (const r of inPeriod) {
    bySeverity[r.severity] += 1;
    byRootCauseClass[r.root_cause_class] = (byRootCauseClass[r.root_cause_class] ?? 0) + 1;
  }

  const unconvertedP1 = inPeriod.filter((r) => r.severity === 'P1' && !r.rule_created);

  // Repeat counts are computed across ALL of the client's rows, not just the
  // period — a class that failed twice in March is still a repeat in April.
  const classTotals: Record<string, number> = {};
  for (const r of mine) {
    classTotals[r.root_cause_class] = (classTotals[r.root_cause_class] ?? 0) + 1;
  }

  const candidateRules: CandidateRule[] = [];
  const seenClasses = new Set<string>();
  for (const r of inPeriod) {
    if (r.rule_created || seenClasses.has(r.root_cause_class)) continue;
    const repeatCount = classTotals[r.root_cause_class] ?? 0;
    if (r.severity !== 'P1' && repeatCount < 2) continue;
    seenClasses.add(r.root_cause_class);
    candidateRules.push({
      rootCauseClass: r.root_cause_class,
      severity: r.severity,
      repeatCount,
      draftRule: `Before this class of task completes, verify: ${r.should_have}`,
    });
  }

  return {
    period: period ?? null,
    total: inPeriod.length,
    bySeverity,
    byRootCauseClass,
    unconvertedP1,
    candidateRules,
  };
}
