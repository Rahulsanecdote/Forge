import { supabase } from '../../supabase';
import { publishApprovedRun } from './publish';
import { scheduleStatusForPublish } from './schedule-mapping';

export interface DueSchedule {
  id: string;
  run_id: string;
  attempts: number;
}

export interface ScheduleRunResult {
  scheduleId: string;
  runId: string;
  status: 'published' | 'failed' | 'skipped';
  publishStatus?: string;
}

// Schedules whose time has come and are still pending. Bounded so a backlog can't
// blow up a single cron invocation; the next tick picks up the remainder.
export async function loadDueSchedules(nowIso: string, limit = 50): Promise<DueSchedule[]> {
  const { data, error } = await supabase
    .from('content_schedules')
    .select('id, run_id, attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not load due schedules: ${error.message}`);
  return (data ?? []) as DueSchedule[];
}

// Atomically claim a pending schedule (pending -> publishing). The status guard
// makes the update a no-op if another concurrent worker already claimed it, so we
// never publish the same run twice from overlapping cron runs.
async function claimSchedule(schedule: DueSchedule): Promise<boolean> {
  const { data, error } = await supabase
    .from('content_schedules')
    .update({
      status: 'publishing',
      attempts: schedule.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', schedule.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Could not claim schedule ${schedule.id}: ${error.message}`);
  return Boolean(data);
}

// Claim one due schedule and publish its run through the shared fail-closed path,
// then record the terminal status. Publishing is idempotent, so a claim that
// finds the run already published resolves to 'published'.
export async function runDueSchedule(schedule: DueSchedule): Promise<ScheduleRunResult> {
  const claimed = await claimSchedule(schedule);
  if (!claimed) {
    return { scheduleId: schedule.id, runId: schedule.run_id, status: 'skipped' };
  }

  const outcome = await publishApprovedRun(schedule.run_id);
  const status = scheduleStatusForPublish(outcome.status);

  // Billing-blocked: release the claim back to pending (recording why) so the post
  // publishes automatically once the client is active again, rather than failing for good.
  if (status === 'pending') {
    await supabase
      .from('content_schedules')
      .update({ status: 'pending', last_error: outcome.status, updated_at: new Date().toISOString() })
      .eq('id', schedule.id);
    return { scheduleId: schedule.id, runId: schedule.run_id, status: 'skipped', publishStatus: outcome.status };
  }

  await supabase
    .from('content_schedules')
    .update({
      status,
      last_error: status === 'failed' ? outcome.status : null,
      published_at: status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', schedule.id);

  return {
    scheduleId: schedule.id,
    runId: schedule.run_id,
    status,
    publishStatus: outcome.status,
  };
}
