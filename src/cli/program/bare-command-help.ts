import type { Command } from "commander";

/**
 * Attach a default action to a parent command so that invoking it bare
 * (`openclaw <name>` with no subcommand) prints the help and exits 0,
 * matching the behavior of `openclaw <name> --help`.
 *
 * Without this, commander's default behavior on a parent command with
 * subcommands but no own action is to print help and exit with code 1
 * (treated as a usage error). That breaks shell `&&` chains and is
 * inconsistent with sibling parents like `agents` and `sessions` that
 * already define a bare default action.
 *
 * Use this only on parent commands whose bare invocation should be a
 * no-op + help (purely informational). Commands that intentionally treat
 * a missing subcommand as a usage error should keep `cmd.help({ error: true })`.
 */
export function attachBareCommandHelp(cmd: Command): Command {
  cmd.action(() => {
    cmd.help({ error: false });
  });
  return cmd;
}
