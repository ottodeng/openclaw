import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/text-runtime";

// Matches the Azure host set recognized elsewhere in the provider
// (see `isAzureOpenAICompatibleHost` in `src/agents/openai-transport-stream.ts`).
// Duplicated here because extensions cannot import from `src/` under the
// `lint:extensions:no-src-outside-plugin-sdk` boundary check.
const AZURE_OPENAI_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".services.ai.azure.com",
  ".cognitiveservices.azure.com",
] as const;

// Matches the default used by chat / Responses in
// `src/agents/openai-transport-stream.ts` (`DEFAULT_AZURE_OPENAI_API_VERSION`).
// Kept in sync manually; see that file for the canonical value.
const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-12-01-preview";

export function isAzureOpenAIBaseUrl(baseUrl?: string): boolean {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const host = normalizeLowercaseStringOrEmpty(new URL(trimmed).hostname);
    return AZURE_OPENAI_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

export function resolveAzureOpenAIApiVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.AZURE_OPENAI_API_VERSION?.trim() || DEFAULT_AZURE_OPENAI_API_VERSION;
}

export type AzureOpenAIImageRoute = {
  url: string;
  headers: Record<string, string>;
};

/**
 * Builds an Azure OpenAI image-route URL + auth header override.
 *
 * Azure's shape is `{endpoint}/openai/deployments/{deployment}/images/{op}?api-version=...`
 * with the key passed as `api-key:` (public OpenAI uses `Authorization: Bearer`).
 * The deployment name comes from `model` — this mirrors the chat path's
 * `resolveAzureDeploymentName` convention where deployment names are routed via `model`.
 */
export function buildAzureOpenAIImageRoute(params: {
  baseUrl: string;
  deployment: string;
  apiKey: string;
  operation: "generations" | "edits";
  apiVersion?: string;
}): AzureOpenAIImageRoute {
  const base = params.baseUrl.replace(/\/+$/, "");
  const apiVersion = params.apiVersion?.trim() || resolveAzureOpenAIApiVersion();
  const deployment = encodeURIComponent(params.deployment);
  return {
    url: `${base}/openai/deployments/${deployment}/images/${params.operation}?api-version=${encodeURIComponent(
      apiVersion,
    )}`,
    headers: {
      "api-key": params.apiKey,
    },
  };
}
