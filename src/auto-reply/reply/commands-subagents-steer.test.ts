import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSubagentsDispatchContext,
  subagentControlMocks,
} from "./commands-subagents-send-steer.test-support.js";
import { buildSubagentsSendContext } from "./commands-subagents.test-helpers.js";
import { handleSubagentsSendAction } from "./commands-subagents/action-send.js";

const buildContext = () =>
  buildSubagentsDispatchContext({
    handledPrefix: "/steer",
    restTokens: ["1", "check", "timer.ts", "instead"],
  });

describe("subagents steer action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats accepted steer replies", async () => {
    subagentControlMocks.steerControlledSubagentRun.mockResolvedValue({
      status: "accepted",
      runId: "run-steer-1",
    });
    const result = await handleSubagentsSendAction(buildContext(), true);
    expect(result).toEqual({
      shouldContinue: false,
      reply: { text: "steered do thing (run run-stee)." },
    });
  });

  it("formats steer dispatch errors", async () => {
    subagentControlMocks.steerControlledSubagentRun.mockResolvedValue({
      status: "error",
      error: "dispatch failed",
    });
    const result = await handleSubagentsSendAction(buildContext(), true);
    expect(result).toEqual({
      shouldContinue: false,
      reply: { text: "send failed: dispatch failed" },
    });
  });

  // Regression: #76512 — /steer without an explicit id should auto-select the
  // sole active run so Telegram users can do `/steer some message` without
  // having to know the subagent index.
  describe("optional id with single active run", () => {
    it("auto-selects the active run when first token is not a known id", async () => {
      subagentControlMocks.steerControlledSubagentRun.mockResolvedValue({
        status: "accepted",
        runId: "run-steer-1",
      });
      const ctx = buildSubagentsSendContext({
        handledPrefix: "/steer",
        restTokens: ["hello", "world"],
        // default runs: one active run with task "do thing" and runId "run-1"
      });
      const result = await handleSubagentsSendAction(ctx, true);
      expect(result).toEqual({
        shouldContinue: false,
        reply: { text: "steered do thing (run run-stee)." },
      });
      expect(subagentControlMocks.steerControlledSubagentRun).toHaveBeenCalledWith(
        expect.objectContaining({ message: "hello world" }),
      );
    });

    it("uses all tokens as the message when the single-token arg doesn't match an id", async () => {
      subagentControlMocks.steerControlledSubagentRun.mockResolvedValue({
        status: "accepted",
        runId: "run-steer-1",
      });
      const ctx = buildSubagentsSendContext({
        handledPrefix: "/steer",
        restTokens: ["look", "at", "the", "output"],
      });
      await handleSubagentsSendAction(ctx, true);
      expect(subagentControlMocks.steerControlledSubagentRun).toHaveBeenCalledWith(
        expect.objectContaining({ message: "look at the output" }),
      );
    });

    it("errors when there are no active runs", async () => {
      const ctx = buildSubagentsSendContext({
        handledPrefix: "/steer",
        restTokens: ["hello", "world"],
        runs: [
          {
            runId: "run-1",
            childSessionKey: "agent:main:subagent:abc",
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "done task",
            cleanup: "keep",
            createdAt: 1000,
            startedAt: 1000,
            endedAt: 2000,
          },
        ],
      });
      const result = await handleSubagentsSendAction(ctx, true);
      expect(result).toEqual({
        shouldContinue: false,
        reply: { text: "No active subagent runs to steer." },
      });
    });

    it("propagates id-resolution error when there are multiple active runs", async () => {
      const ctx = buildSubagentsSendContext({
        handledPrefix: "/steer",
        restTokens: ["hello", "world"],
        runs: [
          {
            runId: "run-1",
            childSessionKey: "agent:main:subagent:abc",
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "task one",
            cleanup: "keep",
            createdAt: 1000,
            startedAt: 1000,
          },
          {
            runId: "run-2",
            childSessionKey: "agent:main:subagent:def",
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "task two",
            cleanup: "keep",
            createdAt: 1000,
            startedAt: 1000,
          },
        ],
      });
      const result = await handleSubagentsSendAction(ctx, true);
      expect(result).toEqual({
        shouldContinue: false,
        reply: { text: "⚠️ Unknown subagent id: hello" },
      });
    });
  });
});
