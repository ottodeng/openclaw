---
summary: "Azure AI Speech text-to-speech and realtime speech-to-text for OpenClaw"
read_when:
  - You want Azure Speech synthesis for outbound replies
  - You need native Ogg Opus voice-note output from Azure Speech
  - You want Azure Speech realtime transcription for Voice Call streaming
title: "Azure Speech"
---

Azure Speech is an Azure AI Speech provider for OpenClaw. It synthesizes
outbound reply audio (MP3 by default, native Ogg/Opus for voice notes,
8 kHz mulaw for telephony channels such as Voice Call) and provides realtime
speech-to-text transcription for Voice Call streaming.

OpenClaw uses the Azure Speech REST API directly with SSML for TTS, and the
official `microsoft-cognitiveservices-speech-sdk` package for realtime
recognition over Azure's continuous-recognition WebSocket protocol. The
Speech SDK is loaded lazily on first use, so installations that only use
TTS pay no extra startup cost.

| Detail                  | Value                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Website                 | [Azure AI Speech](https://azure.microsoft.com/products/ai-services/ai-speech)                                  |
| Docs                    | [Speech REST text-to-speech](https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech) |
| Auth                    | `AZURE_SPEECH_KEY` plus `AZURE_SPEECH_REGION`                                                                  |
| Default voice           | `en-US-JennyNeural`                                                                                            |
| Default file output     | `audio-24khz-48kbitrate-mono-mp3`                                                                              |
| Default voice-note file | `ogg-24khz-16bit-mono-opus`                                                                                    |

## Getting started

<Steps>
  <Step title="Create an Azure Speech resource">
    In the Azure portal, create a Speech resource. Copy **KEY 1** from
    Resource Management > Keys and Endpoint, and copy the resource location
    such as `eastus`.

    ```
    AZURE_SPEECH_KEY=<speech-resource-key>
    AZURE_SPEECH_REGION=eastus
    ```

  </Step>
  <Step title="Select Azure Speech in messages.tts">
    ```json5
    {
      messages: {
        tts: {
          auto: "always",
          provider: "azure-speech",
          providers: {
            "azure-speech": {
              voice: "en-US-JennyNeural",
              lang: "en-US",
            },
          },
        },
      },
    }
    ```
  </Step>
  <Step title="Send a message">
    Send a reply through any connected channel. OpenClaw synthesizes the audio
    with Azure Speech and delivers MP3 for standard audio, or Ogg/Opus when
    the channel expects a voice note.
  </Step>
</Steps>

## Configuration options

| Option                  | Path                                                        | Description                                                                                           |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `apiKey`                | `messages.tts.providers.azure-speech.apiKey`                | Azure Speech resource key. Falls back to `AZURE_SPEECH_KEY`, `AZURE_SPEECH_API_KEY`, or `SPEECH_KEY`. |
| `region`                | `messages.tts.providers.azure-speech.region`                | Azure Speech resource region. Falls back to `AZURE_SPEECH_REGION` or `SPEECH_REGION`.                 |
| `endpoint`              | `messages.tts.providers.azure-speech.endpoint`              | Optional Azure Speech endpoint/base URL override.                                                     |
| `baseUrl`               | `messages.tts.providers.azure-speech.baseUrl`               | Optional Azure Speech base URL override.                                                              |
| `voice`                 | `messages.tts.providers.azure-speech.voice`                 | Azure voice ShortName (default `en-US-JennyNeural`).                                                  |
| `lang`                  | `messages.tts.providers.azure-speech.lang`                  | SSML language code (default `en-US`).                                                                 |
| `outputFormat`          | `messages.tts.providers.azure-speech.outputFormat`          | Audio-file output format (default `audio-24khz-48kbitrate-mono-mp3`).                                 |
| `voiceNoteOutputFormat` | `messages.tts.providers.azure-speech.voiceNoteOutputFormat` | Voice-note output format (default `ogg-24khz-16bit-mono-opus`).                                       |

### Realtime transcription (Voice Call streaming)

The options below live under `plugins.entries.voice-call.config.streaming.providers.azure-speech.*`.

| Option                    | Description                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | Azure Speech resource key. Falls back to `AZURE_SPEECH_KEY`, `AZURE_SPEECH_API_KEY`, or `SPEECH_KEY`.                 |
| `region`                  | Azure Speech resource region. Falls back to `AZURE_SPEECH_REGION` or `SPEECH_REGION`. Required unless `endpoint` set. |
| `endpoint`                | Custom Azure Speech endpoint URL. Used in place of `region` for sovereign clouds or private endpoints.                |
| `language`                | Primary recognition language (BCP-47), default `en-US`.                                                               |
| `sampleRate`              | Input audio sample rate in Hz (default `8000`, matches telephony media streams).                                      |
| `encoding`                | Input audio encoding: `pcm` (16-bit linear), `mulaw`, or `alaw`. Default `mulaw`.                                     |
| `initialSilenceTimeoutMs` | Timeout (ms) before any speech is detected (default `5000`).                                                          |
| `endSilenceTimeoutMs`     | Trailing-silence threshold (ms) for finalizing an utterance (default `800`).                                          |
| `candidateLanguages`      | Optional language ID candidates, e.g. `["en-US", "zh-CN"]`. When set, replaces single-language recognition.           |

## Notes

<AccordionGroup>
  <Accordion title="Authentication">
    Azure Speech uses a Speech resource key, not an Azure OpenAI key. The key
    is sent as `Ocp-Apim-Subscription-Key`; OpenClaw derives
    `https://<region>.tts.speech.microsoft.com` from `region` unless you
    provide `endpoint` or `baseUrl`.
  </Accordion>
  <Accordion title="Voice names">
    Use the Azure Speech voice `ShortName` value, for example
    `en-US-JennyNeural`. The bundled provider can list voices through the
    same Speech resource and filters voices marked deprecated or retired.
  </Accordion>
  <Accordion title="Audio outputs">
    Azure accepts output formats such as `audio-24khz-48kbitrate-mono-mp3`,
    `ogg-24khz-16bit-mono-opus`, and `riff-24khz-16bit-mono-pcm`. OpenClaw
    requests Ogg/Opus for `voice-note` targets so channels can send native
    voice bubbles without an extra MP3 conversion.
  </Accordion>
  <Accordion title="Realtime transcription">
    The same plugin also registers Azure Speech as a realtime
    transcription provider for Voice Call (`streaming.provider:
    "azure-speech"`). It supports `pcm`, `mulaw`, and `alaw` input audio at
    arbitrary sample rates (default 8 kHz mulaw to match telephony media
    streams), partial and final transcripts, configurable initial and
    end-of-utterance silence thresholds, and Azure auto language detection
    via `candidateLanguages`. See the [Voice Call plugin
    docs](/plugins/voice-call#streaming-transcription) for the full streaming
    config schema and example.
  </Accordion>
  <Accordion title="Alias">
    `azure` is accepted as a provider alias for existing PRs and user config,
    but new config should use `azure-speech` to avoid confusion with Azure
    OpenAI model providers.
  </Accordion>
</AccordionGroup>

## Related

<CardGroup cols={2}>
  <Card title="Text-to-speech" href="/tools/tts" icon="waveform-lines">
    TTS overview, providers, and `messages.tts` config.
  </Card>
  <Card title="Configuration" href="/gateway/configuration" icon="gear">
    Full config reference including `messages.tts` settings.
  </Card>
  <Card title="Providers" href="/providers" icon="grid">
    All bundled OpenClaw providers.
  </Card>
  <Card title="Troubleshooting" href="/help/troubleshooting" icon="wrench">
    Common issues and debugging steps.
  </Card>
</CardGroup>
