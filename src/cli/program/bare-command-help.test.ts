import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { attachBareCommandHelp } from "./bare-command-help.js";

function buildParentWithSubcommand(): { program: Command; parent: Command } {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  const parent = program.command("widget").description("manage widgets");
  parent.exitOverride();
  parent.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  parent
    .command("list")
    .description("list widgets")
    .action(() => {});
  return { program, parent };
}

describe("attachBareCommandHelp", () => {
  it("makes bare parent invocation print help and exit cleanly", () => {
    const { program, parent } = buildParentWithSubcommand();
    const writeOut = vi.fn<(str: string) => void>();
    parent.configureOutput({ writeOut, writeErr: () => {} });
    attachBareCommandHelp(parent);

    // commander invokes process.exit(0) via exitOverride after .help() — must not throw a usage error
    expect(() => program.parse(["node", "prog", "widget"])).toThrow(
      expect.objectContaining({ code: "commander.help" }),
    );

    expect(writeOut).toHaveBeenCalled();
    const output = writeOut.mock.calls.map((call) => call[0]).join("");
    expect(output).toContain("widget");
    expect(output).toContain("list");
  });

  it("does not interfere with subcommand invocation", () => {
    const { program, parent } = buildParentWithSubcommand();
    attachBareCommandHelp(parent);
    const listAction = vi.fn();
    parent.command("show").description("show widget").action(listAction);

    program.parse(["node", "prog", "widget", "show"]);
    expect(listAction).toHaveBeenCalled();
  });

  it("returns the same command for chaining", () => {
    const cmd = new Command("widget");
    cmd
      .command("noop")
      .description("noop")
      .action(() => {});
    expect(attachBareCommandHelp(cmd)).toBe(cmd);
  });
});

describe("attachBareCommandHelp regression: bare parent must exit 0", () => {
  // commander's default behavior for a parent command with subcommands but
  // no own action is to print help to stderr and exit with code 1. This
  // breaks `openclaw <parent> && next-command` shell chains. The helper
  // installs an explicit action that calls .help({ error: false }) so the
  // process exits 0 with help on stdout.
  it("uses error:false (exit code 0) instead of commander default (exit 1)", () => {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    const cmd = program.command("widget").description("manage widgets");
    cmd.exitOverride();
    const writeOut = vi.fn<(str: string) => void>();
    const writeErr = vi.fn<(str: string) => void>();
    cmd.configureOutput({ writeOut, writeErr });
    cmd
      .command("list")
      .description("list")
      .action(() => {});
    attachBareCommandHelp(cmd);

    let caught: { code?: string; exitCode?: number } | null = null;
    const previousExitCode = process.exitCode;
    process.exitCode = 0;
    try {
      program.parse(["node", "prog", "widget"]);
    } catch (err) {
      caught = err as { code?: string; exitCode?: number };
    } finally {
      process.exitCode = previousExitCode;
    }

    expect(caught).not.toBeNull();
    expect(caught?.code).toBe("commander.help");
    expect(caught?.exitCode).toBe(0);
    expect(writeOut).toHaveBeenCalled();
    expect(writeErr).not.toHaveBeenCalled();
  });
});
