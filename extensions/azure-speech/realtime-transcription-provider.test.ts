import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing,
  buildAzureSpeechRealtimeTranscriptionProvider,
  type AzureSpeechPushStream,
  type AzureSpeechRealtimeSdk,
  type AzureSpeechSpeechRecognizer,
} from "./realtime-transcription-provider.js";

const ENV_KEYS = [
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_API_KEY",
  "SPEECH_KEY",
  "AZURE_SPEECH_REGION",
  "SPEECH_REGION",
  "AZURE_SPEECH_ENDPOINT",
] as const;

function snapshotEnv() {
  const previous: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  return previous;
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = previous[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

type RecognizerHooks = {
  recognizer: AzureSpeechSpeechRecognizer;
  startSpy: ReturnType<typeof vi.fn>;
  stopSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
  speechConfigSetProperty: ReturnType<typeof vi.fn>;
  pushStream: AzureSpeechPushStream & {
    writeSpy: ReturnType<typeof vi.fn>;
    closeSpy: ReturnType<typeof vi.fn>;
  };
  fromConfigSpy: ReturnType<typeof vi.fn>;
  recognizerCtorSpy: ReturnType<typeof vi.fn>;
  speechConfigFromSubscriptionSpy: ReturnType<typeof vi.fn>;
  speechConfigFromEndpointSpy: ReturnType<typeof vi.fn>;
  audioFormatSpy: ReturnType<typeof vi.fn>;
  speechConfig: {
    speechRecognitionLanguage: string;
    setProperty: (id: number, val: string) => void;
  };
};

function createMockSdk(opts: { startsOk?: boolean; stopsOk?: boolean } = {}): {
  sdk: AzureSpeechRealtimeSdk;
  hooks: RecognizerHooks;
} {
  const startsOk = opts.startsOk ?? true;
  const stopsOk = opts.stopsOk ?? true;

  const writeSpy = vi.fn();
  const pushCloseSpy = vi.fn();
  const pushStream: AzureSpeechPushStream & {
    writeSpy: typeof writeSpy;
    closeSpy: typeof pushCloseSpy;
  } = {
    write: writeSpy,
    close: pushCloseSpy,
    writeSpy,
    closeSpy: pushCloseSpy,
  };

  const startSpy = vi.fn((success?: () => void, error?: (msg: string) => void) => {
    if (startsOk) {
      success?.();
    } else {
      error?.("simulated start failure");
    }
  });
  const stopSpy = vi.fn((success?: () => void, error?: (msg: string) => void) => {
    if (stopsOk) {
      success?.();
    } else {
      error?.("simulated stop failure");
    }
  });
  const recognizerCloseSpy = vi.fn();

  const recognizer: AzureSpeechSpeechRecognizer = {
    recognizing: () => undefined,
    recognized: () => undefined,
    canceled: () => undefined,
    sessionStarted: () => undefined,
    sessionStopped: () => undefined,
    speechStartDetected: () => undefined,
    startContinuousRecognitionAsync: startSpy,
    stopContinuousRecognitionAsync: stopSpy,
    close: recognizerCloseSpy,
  };

  const speechConfigSetProperty = vi.fn();
  const speechConfig = {
    speechRecognitionLanguage: "",
    setProperty: speechConfigSetProperty,
  };

  const speechConfigFromSubscriptionSpy = vi.fn(() => speechConfig);
  const speechConfigFromEndpointSpy = vi.fn(() => speechConfig);
  const audioFormatSpy = vi.fn(() => ({ kind: "format" }));
  const recognizerCtorSpy = vi.fn(function (this: unknown) {
    return recognizer;
  });
  const fromConfigSpy = vi.fn(() => recognizer);

  const SpeechRecognizerCtor =
    recognizerCtorSpy as unknown as AzureSpeechRealtimeSdk["SpeechRecognizer"];
  (SpeechRecognizerCtor as unknown as { FromConfig: typeof fromConfigSpy }).FromConfig =
    fromConfigSpy;

  const sdk: AzureSpeechRealtimeSdk = {
    AudioFormatTag: { PCM: 1, MuLaw: 2, ALaw: 8 },
    AudioStreamFormat: { getWaveFormat: audioFormatSpy },
    AudioInputStream: {
      createPushStream: (_format) => pushStream,
    },
    AudioConfig: { fromStreamInput: () => ({ kind: "audio-config" }) },
    SpeechConfig: {
      fromSubscription: speechConfigFromSubscriptionSpy,
      fromEndpoint: speechConfigFromEndpointSpy,
    },
    AutoDetectSourceLanguageConfig: {
      fromLanguages: (langs) => ({ kind: "auto-detect", langs }),
    },
    PropertyId: {
      SpeechServiceConnection_InitialSilenceTimeoutMs: 29,
      SpeechServiceConnection_EndSilenceTimeoutMs: 30,
    },
    ResultReason: { RecognizingSpeech: 2, RecognizedSpeech: 3, NoMatch: 0 },
    CancellationReason: { Error: 1, EndOfStream: 0 },
    SpeechRecognizer: SpeechRecognizerCtor,
  };

  return {
    sdk,
    hooks: {
      recognizer,
      startSpy,
      stopSpy,
      closeSpy: recognizerCloseSpy,
      speechConfigSetProperty,
      pushStream,
      fromConfigSpy,
      recognizerCtorSpy,
      speechConfigFromSubscriptionSpy,
      speechConfigFromEndpointSpy,
      audioFormatSpy,
      speechConfig,
    },
  };
}

describe("normalizeAzureSpeechRealtimeProviderConfig", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("reads explicit config from a flat record", () => {
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({
      apiKey: "K",
      region: "eastus",
      language: "en-US",
      sampleRate: 16000,
      encoding: "pcm",
      initialSilenceTimeoutMs: 4000,
      endSilenceTimeoutMs: 600,
      candidateLanguages: ["en-US", "zh-CN"],
    });
    expect(out).toMatchObject({
      apiKey: "K",
      region: "eastus",
      language: "en-US",
      sampleRate: 16000,
      encoding: "pcm",
      initialSilenceTimeoutMs: 4000,
      endSilenceTimeoutMs: 600,
      candidateLanguages: ["en-US", "zh-CN"],
    });
  });

  it("reads from providers.azure-speech sub-config (voice-call style)", () => {
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({
      providers: {
        "azure-speech": {
          apiKey: "K2",
          region: "westus",
          encoding: "g711_ulaw",
          endpointingMs: 700,
        },
      },
    });
    expect(out.apiKey).toBe("K2");
    expect(out.region).toBe("westus");
    expect(out.encoding).toBe("mulaw");
    expect(out.endSilenceTimeoutMs).toBe(700);
  });

  it("reads from providers.azure alias sub-config", () => {
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({
      providers: {
        azure: {
          apiKey: "K3",
          region: "southeastasia",
        },
      },
    });
    expect(out.apiKey).toBe("K3");
    expect(out.region).toBe("southeastasia");
  });

  it("falls back to env vars when no inline config is present", () => {
    process.env.AZURE_SPEECH_KEY = "env-key";
    process.env.AZURE_SPEECH_REGION = "eastus2";
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({});
    expect(out.apiKey).toBe("env-key");
    expect(out.region).toBe("eastus2");
  });

  it("prefers SPEECH_KEY/SPEECH_REGION env vars when others are absent", () => {
    process.env.SPEECH_KEY = "speech-env";
    process.env.SPEECH_REGION = "eastus";
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({});
    expect(out.apiKey).toBe("speech-env");
    expect(out.region).toBe("eastus");
  });

  it("normalizes encoding aliases to canonical form", () => {
    expect(
      __testing.normalizeAzureSpeechRealtimeProviderConfig({ encoding: "linear16" }).encoding,
    ).toBe("pcm");
    expect(
      __testing.normalizeAzureSpeechRealtimeProviderConfig({ encoding: "ulaw" }).encoding,
    ).toBe("mulaw");
    expect(
      __testing.normalizeAzureSpeechRealtimeProviderConfig({ encoding: "g711-alaw" }).encoding,
    ).toBe("alaw");
  });

  it("rejects unknown encodings", () => {
    expect(() =>
      __testing.normalizeAzureSpeechRealtimeProviderConfig({ encoding: "vorbis" }),
    ).toThrow(/Invalid Azure Speech realtime transcription encoding/);
  });

  it("parses candidateLanguages from comma-separated string", () => {
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({
      candidateLanguages: "en-US, zh-CN, ja-JP",
    });
    expect(out.candidateLanguages).toEqual(["en-US", "zh-CN", "ja-JP"]);
  });

  it("ignores blank candidate language entries", () => {
    const out = __testing.normalizeAzureSpeechRealtimeProviderConfig({
      candidateLanguages: ["en-US", "", "  ", "zh-CN"],
    });
    expect(out.candidateLanguages).toEqual(["en-US", "zh-CN"]);
  });
});

describe("audioFormatTagFor / bitsPerSampleFor", () => {
  const sdk = createMockSdk().sdk;

  it("maps each encoding to the right SDK constants", () => {
    expect(__testing.audioFormatTagFor("pcm", sdk)).toBe(sdk.AudioFormatTag.PCM);
    expect(__testing.audioFormatTagFor("mulaw", sdk)).toBe(sdk.AudioFormatTag.MuLaw);
    expect(__testing.audioFormatTagFor("alaw", sdk)).toBe(sdk.AudioFormatTag.ALaw);
  });

  it("maps each encoding to the right bits-per-sample", () => {
    expect(__testing.bitsPerSampleFor("pcm")).toBe(16);
    expect(__testing.bitsPerSampleFor("mulaw")).toBe(8);
    expect(__testing.bitsPerSampleFor("alaw")).toBe(8);
  });
});

describe("bufferToArrayBuffer", () => {
  it("returns the underlying ArrayBuffer when the Buffer covers it fully", () => {
    const ab = new ArrayBuffer(8);
    const buf = Buffer.from(ab);
    expect(__testing.bufferToArrayBuffer(buf)).toBe(ab);
  });

  it("slices when the Buffer is a window into a larger ArrayBuffer", () => {
    const ab = new ArrayBuffer(16);
    const buf = Buffer.from(ab, 4, 8);
    const result = __testing.bufferToArrayBuffer(buf);
    expect(result).not.toBe(ab);
    expect(result.byteLength).toBe(8);
  });
});

describe("buildAzureSpeechRealtimeTranscriptionProvider — registry contract", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("reports the canonical id and aliases", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(provider.id).toBe("azure-speech");
    expect(provider.aliases).toEqual(
      expect.arrayContaining(["azure", "azure-realtime", "azure-speech-realtime"]),
    );
  });

  it("reports configured when both apiKey and region are present", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(
      provider.isConfigured({
        providerConfig: { apiKey: "K", region: "eastus" },
      }),
    ).toBe(true);
  });

  it("reports configured when apiKey + endpoint are present (no region)", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(
      provider.isConfigured({
        providerConfig: {
          apiKey: "K",
          endpoint: "https://example.cognitiveservices.azure.com/",
        },
      }),
    ).toBe(true);
  });

  it("reports not-configured when apiKey is missing", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(provider.isConfigured({ providerConfig: { region: "eastus" } })).toBe(false);
  });

  it("reports not-configured when neither region nor endpoint is present", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(provider.isConfigured({ providerConfig: { apiKey: "K" } })).toBe(false);
  });

  it("createSession throws clearly when apiKey is missing", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(() =>
      provider.createSession({
        providerConfig: { region: "eastus" },
      }),
    ).toThrow(/Azure Speech API key missing/);
  });

  it("createSession throws clearly when neither region nor endpoint is set", () => {
    const provider = buildAzureSpeechRealtimeTranscriptionProvider({
      loadSdk: async () => createMockSdk().sdk,
    });
    expect(() =>
      provider.createSession({
        providerConfig: { apiKey: "K" },
      }),
    ).toThrow(/region or endpoint/);
  });
});
