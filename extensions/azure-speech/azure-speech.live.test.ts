import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  registerProviderPlugin,
  requireRegisteredProvider,
} from "openclaw/plugin-sdk/plugin-test-runtime";
import { isLiveTestEnabled } from "openclaw/plugin-sdk/test-env";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

const AZURE_SPEECH_KEY =
  process.env.AZURE_SPEECH_KEY?.trim() ??
  process.env.AZURE_SPEECH_API_KEY?.trim() ??
  process.env.SPEECH_KEY?.trim() ??
  "";
const AZURE_SPEECH_REGION =
  process.env.AZURE_SPEECH_REGION?.trim() ?? process.env.SPEECH_REGION?.trim() ?? "";
const LIVE = isLiveTestEnabled() && AZURE_SPEECH_KEY.length > 0 && AZURE_SPEECH_REGION.length > 0;
const describeLive = LIVE ? describe : describe.skip;

const registerAzureSpeechPlugin = () =>
  registerProviderPlugin({
    plugin,
    id: "azure-speech",
    name: "Azure Speech",
  });

describeLive("azure speech plugin live", () => {
  it("lists voices through the registered speech provider", async () => {
    const { speechProviders } = await registerAzureSpeechPlugin();
    const provider = requireRegisteredProvider(speechProviders, "azure-speech");

    const voices = await provider.listVoices?.({
      providerConfig: {
        apiKey: AZURE_SPEECH_KEY,
        region: AZURE_SPEECH_REGION,
      },
    });

    expect(voices?.length).toBeGreaterThan(100);
    expect(voices).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "en-US-JennyNeural" })]),
    );
  }, 120_000);

  it("synthesizes MP3, native Ogg/Opus voice notes, and telephony audio", async () => {
    const { speechProviders } = await registerAzureSpeechPlugin();
    const provider = requireRegisteredProvider(speechProviders, "azure-speech");
    const providerConfig = {
      apiKey: AZURE_SPEECH_KEY,
      region: AZURE_SPEECH_REGION,
      voice: "en-US-JennyNeural",
      lang: "en-US",
    };

    const audioFile = await provider.synthesize({
      text: "OpenClaw Azure Speech text to speech integration test OK.",
      cfg: { plugins: { enabled: true } } as never,
      providerConfig,
      target: "audio-file",
      timeoutMs: 90_000,
    });

    expect(audioFile.outputFormat).toBe("audio-24khz-48kbitrate-mono-mp3");
    expect(audioFile.fileExtension).toBe(".mp3");
    expect(audioFile.voiceCompatible).toBe(false);
    expect(audioFile.audioBuffer.byteLength).toBeGreaterThan(512);

    const voiceNote = await provider.synthesize({
      text: "OpenClaw Azure Speech voice note integration test OK.",
      cfg: { plugins: { enabled: true } } as never,
      providerConfig,
      target: "voice-note",
      timeoutMs: 90_000,
    });

    expect(voiceNote.outputFormat).toBe("ogg-24khz-16bit-mono-opus");
    expect(voiceNote.fileExtension).toBe(".ogg");
    expect(voiceNote.voiceCompatible).toBe(true);
    expect(voiceNote.audioBuffer.byteLength).toBeGreaterThan(128);
    expect(voiceNote.audioBuffer.subarray(0, 4).toString("ascii")).toBe("OggS");

    const telephony = await provider.synthesizeTelephony?.({
      text: "OpenClaw Azure Speech telephony check OK.",
      cfg: { plugins: { enabled: true } } as never,
      providerConfig,
      timeoutMs: 90_000,
    });
    if (!telephony) {
      throw new Error("Azure Speech telephony synthesis did not return audio");
    }
    expect(telephony.outputFormat).toBe("raw-8khz-8bit-mono-mulaw");
    expect(telephony.sampleRate).toBe(8_000);
    expect(telephony.audioBuffer.byteLength).toBeGreaterThan(512);
  }, 180_000);

  it("transcribes a short PCM clip via the realtime transcription provider", async () => {
    const { realtimeTranscriptionProviders } = await registerAzureSpeechPlugin();
    const provider = requireRegisteredProvider(realtimeTranscriptionProviders, "azure-speech");

    // Synthesize a short clip with the same Azure Speech account so we have
    // deterministic input for the recognizer (no fixture file checked in).
    const { speechProviders } = await registerAzureSpeechPlugin();
    const ttsProvider = requireRegisteredProvider(speechProviders, "azure-speech");
    const providerConfig = {
      apiKey: AZURE_SPEECH_KEY,
      region: AZURE_SPEECH_REGION,
    };
    const synth = await ttsProvider.synthesizeTelephony?.({
      text: "OpenClaw realtime transcription smoke test successful.",
      cfg: { plugins: { enabled: true } } as never,
      providerConfig,
      timeoutMs: 90_000,
    });
    if (!synth) {
      throw new Error("Could not synthesize telephony audio for STT live test");
    }

    const partials: string[] = [];
    const finals: string[] = [];
    const errors: Error[] = [];

    const session = provider.createSession({
      providerConfig,
      onPartial: (text) => partials.push(text),
      onTranscript: (text) => finals.push(text),
      onError: (err) => errors.push(err),
    });
    await session.connect();

    // Stream the µ-law audio in 20 ms (160-byte) frames to mimic Twilio media stream.
    const FRAME_BYTES = 160;
    for (let offset = 0; offset < synth.audioBuffer.length; offset += FRAME_BYTES) {
      const frame = synth.audioBuffer.subarray(
        offset,
        Math.min(offset + FRAME_BYTES, synth.audioBuffer.length),
      );
      session.sendAudio(Buffer.from(frame));
      await new Promise<void>((r) => setTimeout(r, 20));
    }

    // Wait for the recognizer to finalize.
    const deadline = Date.now() + 30_000;
    while (finals.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    session.close();

    expect(errors).toEqual([]);
    expect(finals.length).toBeGreaterThan(0);
    // The recognized text should at least mention something from the prompt.
    expect(finals.join(" ").toLowerCase()).toMatch(/openclaw|realtime|transcription|test/);
    // Suppress unused-variable warning when the test passes without partials.
    void partials;
    void readFileSync;
    void resolve;
  }, 180_000);
});
