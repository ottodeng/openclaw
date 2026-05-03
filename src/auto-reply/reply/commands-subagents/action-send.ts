import type { SubagentRunRecord } from "../../../agents/subagent-registry.types.js";
import {
  sendControlledSubagentMessage,
  steerControlledSubagentRun,
} from "../commands-subagents-control.runtime.js";
import type { CommandHandlerResult } from "../commands-types.js";
import { formatRunLabel } from "../subagents-utils.js";
import {
  type SubagentsCommandContext,
  resolveCommandSubagentController,
  resolveSubagentEntryForToken,
  stopWithText,
} from "./shared.js";

/**
 * Resolves the steer target entry and message text.
 *
 * The subagent id is optional when there is exactly one active run: if the
 * first token doesn't resolve to a known run, the whole argument string is
 * treated as the message and the sole active run is selected automatically.
 * This matches the behaviour of the UI's `/steer [id] <message>` executor.
 */
function resolveSteerEntryAndMessage(
  runs: SubagentRunRecord[],
  restTokens: string[],
): { entry: SubagentRunRecord; message: string } | { reply: CommandHandlerResult } {
  const fullMessage = restTokens.join(" ").trim();
  if (!fullMessage) {
    return { reply: stopWithText("Usage: /steer [id|#] <message>") };
  }

  const maybeTarget = restTokens[0];
  const maybeMessage = restTokens.slice(1).join(" ").trim();

  if (maybeTarget && maybeMessage) {
    const idResolution = resolveSubagentEntryForToken(runs, maybeTarget);
    if (!("reply" in idResolution)) {
      return { entry: idResolution.entry, message: maybeMessage };
    }
    // First token didn't match a known run — fall through to single-run check.
    const activeRuns = runs.filter((r) => !r.endedAt);
    if (activeRuns.length === 1) {
      return { entry: activeRuns[0], message: fullMessage };
    }
    if (activeRuns.length === 0) {
      return { reply: stopWithText("No active subagent runs to steer.") };
    }
    // Multiple active runs: the user must provide an explicit id.
    return idResolution; // propagate the "Unknown subagent id" error
  }

  // No resolvable id prefix — auto-select when there's exactly one active run.
  const activeRuns = runs.filter((r) => !r.endedAt);
  if (activeRuns.length === 1) {
    return { entry: activeRuns[0], message: fullMessage };
  }
  return {
    reply: stopWithText(
      activeRuns.length === 0
        ? "No active subagent runs to steer."
        : "Usage: /steer <id|#> <message>",
    ),
  };
}

export async function handleSubagentsSendAction(
  ctx: SubagentsCommandContext,
  steerRequested: boolean,
): Promise<CommandHandlerResult> {
  const { params, runs, restTokens } = ctx;

  let resolvedEntry: SubagentRunRecord;
  let resolvedMessage: string;

  if (steerRequested) {
    const steerResolution = resolveSteerEntryAndMessage(runs, restTokens);
    if ("reply" in steerResolution) {
      return steerResolution.reply;
    }
    resolvedEntry = steerResolution.entry;
    resolvedMessage = steerResolution.message;
  } else {
    const target = restTokens[0];
    const message = restTokens.slice(1).join(" ").trim();
    if (!target || !message) {
      return stopWithText("Usage: /subagents send <id|#> <message>");
    }
    const targetResolution = resolveSubagentEntryForToken(runs, target);
    if ("reply" in targetResolution) {
      return targetResolution.reply;
    }
    resolvedEntry = targetResolution.entry;
    resolvedMessage = message;
  }

  const controller = resolveCommandSubagentController(params, ctx.requesterKey);

  if (steerRequested) {
    const result = await steerControlledSubagentRun({
      cfg: params.cfg,
      controller,
      entry: resolvedEntry,
      message: resolvedMessage,
    });
    if (result.status === "accepted") {
      return stopWithText(
        `steered ${formatRunLabel(resolvedEntry)} (run ${result.runId.slice(0, 8)}).`,
      );
    }
    if (result.status === "done" && result.text) {
      return stopWithText(result.text);
    }
    if (result.status === "error") {
      return stopWithText(`send failed: ${result.error ?? "error"}`);
    }
    return stopWithText(`⚠️ ${result.error ?? "send failed"}`);
  }

  const result = await sendControlledSubagentMessage({
    cfg: params.cfg,
    controller,
    entry: resolvedEntry,
    message: resolvedMessage,
  });
  if (result.status === "timeout") {
    return stopWithText(`⏳ Subagent still running (run ${result.runId.slice(0, 8)}).`);
  }
  if (result.status === "error") {
    return stopWithText(`⚠️ Subagent error: ${result.error} (run ${result.runId.slice(0, 8)}).`);
  }
  if (result.status === "forbidden") {
    return stopWithText(`⚠️ ${result.error ?? "send failed"}`);
  }
  if (result.status === "done") {
    return stopWithText(result.text);
  }
  return stopWithText(
    result.replyText ??
      `✅ Sent to ${formatRunLabel(resolvedEntry)} (run ${result.runId.slice(0, 8)}).`,
  );
}
