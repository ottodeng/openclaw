import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __killSessionProcessTreeForTest } from "./pi-bundle-lsp-runtime.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pi-bundle-lsp-runtime: process group cleanup", () => {
  it.runIf(process.platform !== "win32")(
    "sends SIGTERM to the process group and skips the direct kill on success",
    () => {
      // Spawn a real, harmless child in its own process group so we can verify
      // the negative-PID signaling path actually targets the group.
      const child = spawn("/bin/sh", ["-c", "sleep 30"], {
        stdio: ["ignore", "ignore", "ignore"],
        detached: true,
      });
      try {
        const pid = child.pid;
        expect(pid).toBeTypeOf("number");

        const killSpy = vi.spyOn(process, "kill");
        const directKillSpy = vi.spyOn(child, "kill").mockReturnValue(true);

        const session = {
          serverName: "test",
          process: child,
          requestId: 0,
          pendingRequests: new Map(),
          buffer: "",
          initialized: false,
          capabilities: {},
        };

        __killSessionProcessTreeForTest(session as never);

        // Group SIGTERM to -pid is the only kill we expect when it succeeds:
        // the leader is part of the group, so a direct kill would be a
        // redundant duplicate signal.
        expect(killSpy).toHaveBeenCalledWith(-pid!, "SIGTERM");
        expect(directKillSpy).not.toHaveBeenCalled();
      } finally {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "swallows ESRCH when the process group is already gone",
    () => {
      const fakeChild = {
        pid: 999_999_99, // Almost-certainly nonexistent pid.
        kill: vi.fn().mockReturnValue(true),
      };
      const session = {
        serverName: "test",
        process: fakeChild,
        requestId: 0,
        pendingRequests: new Map(),
        buffer: "",
        initialized: false,
        capabilities: {},
      };

      // Should not throw even though both calls likely fail.
      expect(() => __killSessionProcessTreeForTest(session as never)).not.toThrow();
      expect(fakeChild.kill).toHaveBeenCalledTimes(1);
    },
  );

  it.runIf(process.platform !== "win32")("does not call process.kill when pid is null", () => {
    const fakeChild = {
      pid: undefined,
      kill: vi.fn().mockReturnValue(true),
    };
    const killSpy = vi.spyOn(process, "kill");
    const session = {
      serverName: "test",
      process: fakeChild,
      requestId: 0,
      pendingRequests: new Map(),
      buffer: "",
      initialized: false,
      capabilities: {},
    };

    __killSessionProcessTreeForTest(session as never);

    // Only direct kill, no negative-pid call.
    expect(killSpy).not.toHaveBeenCalled();
    expect(fakeChild.kill).toHaveBeenCalledTimes(1);
  });
});
