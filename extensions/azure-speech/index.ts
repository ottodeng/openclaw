import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildAzureSpeechRealtimeTranscriptionProvider } from "./realtime-transcription-provider.js";
import { buildAzureSpeechProvider } from "./speech-provider.js";

export default definePluginEntry({
  id: "azure-speech",
  name: "Azure Speech",
  description: "Bundled Azure Speech provider (text-to-speech and realtime transcription)",
  register(api) {
    api.registerSpeechProvider(buildAzureSpeechProvider());
    api.registerRealtimeTranscriptionProvider(buildAzureSpeechRealtimeTranscriptionProvider());
  },
});
