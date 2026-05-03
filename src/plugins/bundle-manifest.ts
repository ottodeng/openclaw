import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { matchBoundaryFileOpenFailure, openBoundaryFileSync } from "../infra/boundary-file-read.js";
import { createExistsSyncCache, type ExistsSyncCache } from "../shared/cached-fs.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import { isRecord } from "../utils.js";
import type { PluginBundleFormat } from "./manifest-types.js";
import { DEFAULT_PLUGIN_ENTRY_CANDIDATES, PLUGIN_MANIFEST_FILENAME } from "./manifest.js";

type ResolveExists = (p: string) => boolean;

export const CODEX_BUNDLE_MANIFEST_RELATIVE_PATH = ".codex-plugin/plugin.json";
export const CLAUDE_BUNDLE_MANIFEST_RELATIVE_PATH = ".claude-plugin/plugin.json";
export const CURSOR_BUNDLE_MANIFEST_RELATIVE_PATH = ".cursor-plugin/plugin.json";

export type BundlePluginManifest = {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  skills: string[];
  settingsFiles?: string[];
  // Only include hook roots that OpenClaw can execute via HOOK.md + handler files.
  hooks: string[];
  bundleFormat: PluginBundleFormat;
  capabilities: string[];
};

export type BundleManifestLoadResult =
  | { ok: true; manifest: BundlePluginManifest; manifestPath: string }
  | { ok: false; error: string; manifestPath: string };

type BundleManifestFileLoadResult =
  | { ok: true; raw: Record<string, unknown>; manifestPath: string }
  | { ok: false; error: string; manifestPath: string };

function normalizePathList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function normalizeBundlePathList(value: unknown): string[] {
  return Array.from(new Set(normalizePathList(value)));
}

export function mergeBundlePathLists(...groups: string[][]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const entry of group) {
      if (seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      merged.push(entry);
    }
  }
  return merged;
}

function hasInlineCapabilityValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return value === true;
}

function slugifyPluginId(raw: string | undefined, rootDir: string): string {
  const fallback = path.basename(rootDir);
  const source = normalizeLowercaseStringOrEmpty(raw) || normalizeLowercaseStringOrEmpty(fallback);
  const slug = source
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "bundle-plugin";
}

function loadBundleManifestFile(params: {
  rootDir: string;
  rootRealPath?: string;
  manifestRelativePath: string;
  rejectHardlinks: boolean;
  allowMissing?: boolean;
}): BundleManifestFileLoadResult {
  const manifestPath = path.join(params.rootDir, params.manifestRelativePath);
  const opened = openBoundaryFileSync({
    absolutePath: manifestPath,
    rootPath: params.rootDir,
    ...(params.rootRealPath !== undefined ? { rootRealPath: params.rootRealPath } : {}),
    boundaryLabel: "plugin root",
    rejectHardlinks: params.rejectHardlinks,
  });
  if (!opened.ok) {
    return matchBoundaryFileOpenFailure(opened, {
      path: () => {
        if (params.allowMissing) {
          return { ok: true, raw: {}, manifestPath };
        }
        return { ok: false, error: `plugin manifest not found: ${manifestPath}`, manifestPath };
      },
      fallback: (failure) => ({
        ok: false,
        error: `unsafe plugin manifest path: ${manifestPath} (${failure.reason})`,
        manifestPath,
      }),
    });
  }
  try {
    const raw = JSON5.parse(fs.readFileSync(opened.fd, "utf-8")) as unknown;
    if (!isRecord(raw)) {
      return { ok: false, error: "plugin manifest must be an object", manifestPath };
    }
    return { ok: true, raw, manifestPath };
  } catch (err) {
    return {
      ok: false,
      error: `failed to parse plugin manifest: ${String(err)}`,
      manifestPath,
    };
  } finally {
    fs.closeSync(opened.fd);
  }
}

function resolveCodexSkillDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const declared = normalizeBundlePathList(raw.skills);
  if (declared.length > 0) {
    return declared;
  }
  return resolveExists(path.join(rootDir, "skills")) ? ["skills"] : [];
}

function resolveCodexHookDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const declared = normalizeBundlePathList(raw.hooks);
  if (declared.length > 0) {
    return declared;
  }
  return resolveExists(path.join(rootDir, "hooks")) ? ["hooks"] : [];
}

function resolveCursorSkillsRootDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const declared = normalizeBundlePathList(raw.skills);
  const defaults = resolveExists(path.join(rootDir, "skills")) ? ["skills"] : [];
  return mergeBundlePathLists(defaults, declared);
}

function resolveCursorCommandRootDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const declared = normalizeBundlePathList(raw.commands);
  const defaults = resolveExists(path.join(rootDir, ".cursor", "commands"))
    ? [".cursor/commands"]
    : [];
  return mergeBundlePathLists(defaults, declared);
}

function resolveCursorSkillDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return mergeBundlePathLists(
    resolveCursorSkillsRootDirs(raw, rootDir, resolveExists),
    resolveCursorCommandRootDirs(raw, rootDir, resolveExists),
  );
}

function resolveCursorAgentDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const declared = normalizeBundlePathList(raw.subagents ?? raw.agents);
  const defaults = resolveExists(path.join(rootDir, ".cursor", "agents")) ? [".cursor/agents"] : [];
  return mergeBundlePathLists(defaults, declared);
}

function hasCursorHookCapability(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): boolean {
  return (
    hasInlineCapabilityValue(raw.hooks) ||
    resolveExists(path.join(rootDir, ".cursor", "hooks.json"))
  );
}

function hasCursorRulesCapability(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): boolean {
  return (
    hasInlineCapabilityValue(raw.rules) || resolveExists(path.join(rootDir, ".cursor", "rules"))
  );
}

function hasCursorMcpCapability(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): boolean {
  return hasInlineCapabilityValue(raw.mcpServers) || resolveExists(path.join(rootDir, ".mcp.json"));
}

function resolveClaudeComponentPaths(
  raw: Record<string, unknown>,
  key: string,
  rootDir: string,
  defaults: string[],
  resolveExists: ResolveExists,
): string[] {
  const declared = normalizeBundlePathList(raw[key]);
  const existingDefaults = defaults.filter((candidate) =>
    resolveExists(path.join(rootDir, candidate)),
  );
  return mergeBundlePathLists(existingDefaults, declared);
}

function resolveClaudeSkillsRootDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(raw, "skills", rootDir, ["skills"], resolveExists);
}

function resolveClaudeCommandRootDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(raw, "commands", rootDir, ["commands"], resolveExists);
}

function resolveClaudeAgentDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(raw, "agents", rootDir, ["agents"], resolveExists);
}

function resolveClaudeHookPaths(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(raw, "hooks", rootDir, ["hooks/hooks.json"], resolveExists);
}

function resolveClaudeMcpPaths(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(raw, "mcpServers", rootDir, [".mcp.json"], resolveExists);
}

function resolveClaudeLspPaths(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(raw, "lspServers", rootDir, [".lsp.json"], resolveExists);
}

function resolveClaudeOutputStylePaths(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveClaudeComponentPaths(
    raw,
    "outputStyles",
    rootDir,
    ["output-styles"],
    resolveExists,
  );
}

function resolveClaudeSkillDirs(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return mergeBundlePathLists(
    resolveClaudeSkillsRootDirs(raw, rootDir, resolveExists),
    resolveClaudeCommandRootDirs(raw, rootDir, resolveExists),
    resolveClaudeAgentDirs(raw, rootDir, resolveExists),
    resolveClaudeOutputStylePaths(raw, rootDir, resolveExists),
  );
}

function resolveClaudeSettingsFiles(
  _raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  return resolveExists(path.join(rootDir, "settings.json")) ? ["settings.json"] : [];
}

function hasClaudeHookCapability(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): boolean {
  return (
    hasInlineCapabilityValue(raw.hooks) ||
    resolveClaudeHookPaths(raw, rootDir, resolveExists).length > 0
  );
}

function buildCodexCapabilities(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const capabilities: string[] = [];
  if (resolveCodexSkillDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("skills");
  }
  if (resolveCodexHookDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("hooks");
  }
  if (hasInlineCapabilityValue(raw.mcpServers) || resolveExists(path.join(rootDir, ".mcp.json"))) {
    capabilities.push("mcpServers");
  }
  if (hasInlineCapabilityValue(raw.apps) || resolveExists(path.join(rootDir, ".app.json"))) {
    capabilities.push("apps");
  }
  return capabilities;
}

function buildClaudeCapabilities(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const capabilities: string[] = [];
  if (resolveClaudeSkillDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("skills");
  }
  if (resolveClaudeCommandRootDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("commands");
  }
  if (resolveClaudeAgentDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("agents");
  }
  if (hasClaudeHookCapability(raw, rootDir, resolveExists)) {
    capabilities.push("hooks");
  }
  if (
    hasInlineCapabilityValue(raw.mcpServers) ||
    resolveClaudeMcpPaths(raw, rootDir, resolveExists).length > 0
  ) {
    capabilities.push("mcpServers");
  }
  if (
    hasInlineCapabilityValue(raw.lspServers) ||
    resolveClaudeLspPaths(raw, rootDir, resolveExists).length > 0
  ) {
    capabilities.push("lspServers");
  }
  if (
    hasInlineCapabilityValue(raw.outputStyles) ||
    resolveClaudeOutputStylePaths(raw, rootDir, resolveExists).length > 0
  ) {
    capabilities.push("outputStyles");
  }
  if (resolveClaudeSettingsFiles(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("settings");
  }
  return capabilities;
}

function buildCursorCapabilities(
  raw: Record<string, unknown>,
  rootDir: string,
  resolveExists: ResolveExists,
): string[] {
  const capabilities: string[] = [];
  if (resolveCursorSkillDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("skills");
  }
  if (resolveCursorCommandRootDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("commands");
  }
  if (resolveCursorAgentDirs(raw, rootDir, resolveExists).length > 0) {
    capabilities.push("agents");
  }
  if (hasCursorHookCapability(raw, rootDir, resolveExists)) {
    capabilities.push("hooks");
  }
  if (hasCursorRulesCapability(raw, rootDir, resolveExists)) {
    capabilities.push("rules");
  }
  if (hasCursorMcpCapability(raw, rootDir, resolveExists)) {
    capabilities.push("mcpServers");
  }
  return capabilities;
}

export function loadBundleManifest(params: {
  rootDir: string;
  rootRealPath?: string;
  bundleFormat: PluginBundleFormat;
  rejectHardlinks?: boolean;
  existsCache?: ExistsSyncCache;
}): BundleManifestLoadResult {
  const rejectHardlinks = params.rejectHardlinks ?? true;
  const cache = params.existsCache ?? createExistsSyncCache();
  const resolveExists: ResolveExists = (p) => cache.existsSync(p);
  const manifestRelativePath =
    params.bundleFormat === "codex"
      ? CODEX_BUNDLE_MANIFEST_RELATIVE_PATH
      : params.bundleFormat === "cursor"
        ? CURSOR_BUNDLE_MANIFEST_RELATIVE_PATH
        : CLAUDE_BUNDLE_MANIFEST_RELATIVE_PATH;
  const loaded = loadBundleManifestFile({
    rootDir: params.rootDir,
    ...(params.rootRealPath !== undefined ? { rootRealPath: params.rootRealPath } : {}),
    manifestRelativePath,
    rejectHardlinks,
    allowMissing: params.bundleFormat === "claude",
  });
  if (!loaded.ok) {
    return loaded;
  }

  const raw = loaded.raw;
  const interfaceRecord = isRecord(raw.interface) ? raw.interface : undefined;
  const name = normalizeOptionalString(raw.name);
  const description =
    normalizeOptionalString(raw.description) ??
    normalizeOptionalString(raw.shortDescription) ??
    normalizeOptionalString(interfaceRecord?.shortDescription);
  const version = normalizeOptionalString(raw.version);

  if (params.bundleFormat === "codex") {
    const skills = resolveCodexSkillDirs(raw, params.rootDir, resolveExists);
    const hooks = resolveCodexHookDirs(raw, params.rootDir, resolveExists);
    return {
      ok: true,
      manifest: {
        id: slugifyPluginId(name, params.rootDir),
        name,
        description,
        version,
        skills,
        settingsFiles: [],
        hooks,
        bundleFormat: "codex",
        capabilities: buildCodexCapabilities(raw, params.rootDir, resolveExists),
      },
      manifestPath: loaded.manifestPath,
    };
  }

  if (params.bundleFormat === "cursor") {
    return {
      ok: true,
      manifest: {
        id: slugifyPluginId(name, params.rootDir),
        name,
        description,
        version,
        skills: resolveCursorSkillDirs(raw, params.rootDir, resolveExists),
        settingsFiles: [],
        hooks: [],
        bundleFormat: "cursor",
        capabilities: buildCursorCapabilities(raw, params.rootDir, resolveExists),
      },
      manifestPath: loaded.manifestPath,
    };
  }

  return {
    ok: true,
    manifest: {
      id: slugifyPluginId(name, params.rootDir),
      name,
      description,
      version,
      skills: resolveClaudeSkillDirs(raw, params.rootDir, resolveExists),
      settingsFiles: resolveClaudeSettingsFiles(raw, params.rootDir, resolveExists),
      hooks: resolveClaudeHookPaths(raw, params.rootDir, resolveExists),
      bundleFormat: "claude",
      capabilities: buildClaudeCapabilities(raw, params.rootDir, resolveExists),
    },
    manifestPath: loaded.manifestPath,
  };
}

export function detectBundleManifestFormat(
  rootDir: string,
  existsCache?: ExistsSyncCache,
): PluginBundleFormat | null {
  const cache = existsCache ?? createExistsSyncCache();
  const resolveExists: ResolveExists = (p) => cache.existsSync(p);
  if (resolveExists(path.join(rootDir, CODEX_BUNDLE_MANIFEST_RELATIVE_PATH))) {
    return "codex";
  }
  if (resolveExists(path.join(rootDir, CURSOR_BUNDLE_MANIFEST_RELATIVE_PATH))) {
    return "cursor";
  }
  if (resolveExists(path.join(rootDir, CLAUDE_BUNDLE_MANIFEST_RELATIVE_PATH))) {
    return "claude";
  }
  if (resolveExists(path.join(rootDir, PLUGIN_MANIFEST_FILENAME))) {
    return null;
  }
  if (
    DEFAULT_PLUGIN_ENTRY_CANDIDATES.some((candidate) =>
      resolveExists(path.join(rootDir, candidate)),
    )
  ) {
    return null;
  }
  const manifestlessClaudeMarkers = [
    path.join(rootDir, "skills"),
    path.join(rootDir, "commands"),
    path.join(rootDir, "agents"),
    path.join(rootDir, "hooks", "hooks.json"),
    path.join(rootDir, ".mcp.json"),
    path.join(rootDir, ".lsp.json"),
    path.join(rootDir, "settings.json"),
  ];
  if (manifestlessClaudeMarkers.some((candidate) => resolveExists(candidate))) {
    return "claude";
  }
  return null;
}
