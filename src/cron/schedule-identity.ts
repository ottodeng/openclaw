function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function schedulePayloadFromRecord(
  schedule: Record<string, unknown>,
):
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number }
  | undefined {
  const rawKind = readString(schedule, "kind")?.toLowerCase();
  const expr = readString(schedule, "expr") ?? readString(schedule, "cron");
  const at = readString(schedule, "at");
  const atMs = readNumber(schedule, "atMs");
  const everyMs = readNumber(schedule, "everyMs");
  const anchorMs = readNumber(schedule, "anchorMs");
  const tz = readString(schedule, "tz");
  const staggerMs = readNumber(schedule, "staggerMs");
  const kind =
    rawKind === "at" || rawKind === "every" || rawKind === "cron"
      ? rawKind
      : at || atMs !== undefined
        ? "at"
        : everyMs !== undefined
          ? "every"
          : expr
            ? "cron"
            : undefined;

  if (kind === "at") {
    return at
      ? { kind: "at", at }
      : atMs !== undefined
        ? { kind: "at", at: String(atMs) }
        : undefined;
  }
  if (kind === "every" && everyMs !== undefined) {
    return { kind: "every", everyMs, anchorMs };
  }
  if (kind === "cron" && expr) {
    return { kind: "cron", expr, tz, staggerMs };
  }
  return undefined;
}

function resolveSchedulePayload(
  job: { schedule?: unknown } & Record<string, unknown>,
): ReturnType<typeof schedulePayloadFromRecord> {
  if (job.schedule && typeof job.schedule === "object" && !Array.isArray(job.schedule)) {
    return schedulePayloadFromRecord(job.schedule as Record<string, unknown>);
  }
  return schedulePayloadFromRecord(job);
}

/**
 * Sentinel string used when a job has a malformed/unrecognized schedule
 * (e.g., persisted as a bare string instead of `{ kind, ... }`). We hash the
 * raw schedule value into a stable identity so:
 *   - two reloads of the same malformed entry compare equal (no spurious
 *     `nextRunAtMs` invalidation that would mask a real schedule change), and
 *   - a transition between two different malformed shapes still invalidates
 *     stale `nextRunAtMs`.
 *
 * This keeps `cronSchedulingInputsEqual` total (never throws), so one corrupt
 * persisted entry cannot kill the scheduler tick (#75886).
 */
function malformedScheduleIdentity(
  job: { schedule?: unknown; enabled?: unknown } & Record<string, unknown>,
): string {
  let scheduleRepr: string;
  try {
    scheduleRepr = JSON.stringify(job.schedule ?? null) ?? "null";
  } catch {
    scheduleRepr = `<unserializable:${typeof job.schedule}>`;
  }
  return JSON.stringify({
    version: 1,
    malformed: true,
    enabled: typeof job.enabled === "boolean" ? job.enabled : true,
    scheduleRepr,
  });
}

/**
 * Non-throwing schedule identity. Returns a stable JSON string for any input,
 * including malformed/legacy persisted jobs. Use this anywhere a throw would
 * propagate to the scheduler tick (notably store reload comparison). Callers
 * that need to detect malformed entries should use {@link tryCronScheduleIdentity}.
 */
export function cronScheduleIdentityOrNull(
  job: { schedule?: unknown; enabled?: unknown } & Record<string, unknown>,
): string {
  const schedule = resolveSchedulePayload(job);
  if (!schedule) {
    return malformedScheduleIdentity(job);
  }
  return JSON.stringify({
    version: 1,
    enabled: typeof job.enabled === "boolean" ? job.enabled : true,
    schedule,
  });
}

export function tryCronScheduleIdentity(
  job: { schedule?: unknown; enabled?: unknown } & Record<string, unknown>,
): string | undefined {
  const schedule = resolveSchedulePayload(job);
  if (!schedule) {
    return undefined;
  }
  return JSON.stringify({
    version: 1,
    enabled: typeof job.enabled === "boolean" ? job.enabled : true,
    schedule,
  });
}

/**
 * Total comparison of scheduling inputs. Never throws — see #75886, where a
 * single malformed persisted job (string-shaped `schedule` field) used to
 * propagate "Unsupported cron schedule kind" up through the scheduler tick
 * and freeze `nextWakeAtMs` for every other job.
 */
export function cronSchedulingInputsEqual(
  previous: { schedule?: unknown; enabled?: unknown } & Record<string, unknown>,
  next: { schedule?: unknown; enabled?: unknown } & Record<string, unknown>,
): boolean {
  return cronScheduleIdentityOrNull(previous) === cronScheduleIdentityOrNull(next);
}
