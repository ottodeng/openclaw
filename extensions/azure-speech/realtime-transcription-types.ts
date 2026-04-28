/**
 * Minimal subset of the `microsoft-cognitiveservices-speech-sdk` API that the
 * Azure Speech realtime transcription provider actually uses.
 *
 * Declared structurally so the dependency stays optional and can be mocked in
 * unit tests without pulling the full ~8 MB SDK at test time.
 */
export type AzureSpeechRealtimeSdk = {
  AudioFormatTag: { PCM: number; MuLaw: number; ALaw: number };
  AudioStreamFormat: {
    getWaveFormat(
      samplesPerSecond: number,
      bitsPerSample: number,
      channels: number,
      formatTag: number,
    ): unknown;
  };
  AudioInputStream: {
    createPushStream(format: unknown): AzureSpeechPushStream;
  };
  AudioConfig: {
    fromStreamInput(stream: AzureSpeechPushStream): unknown;
  };
  SpeechConfig: {
    fromSubscription(subscriptionKey: string, region: string): AzureSpeechSpeechConfig;
    fromEndpoint(endpoint: URL, subscriptionKey: string): AzureSpeechSpeechConfig;
  };
  AutoDetectSourceLanguageConfig: {
    fromLanguages(languages: string[]): unknown;
  };
  PropertyId: {
    SpeechServiceConnection_InitialSilenceTimeoutMs: number;
    SpeechServiceConnection_EndSilenceTimeoutMs: number;
  };
  ResultReason: { RecognizingSpeech: number; RecognizedSpeech: number; NoMatch: number };
  CancellationReason: { Error: number; EndOfStream: number };
  SpeechRecognizer: (new (
    speechConfig: AzureSpeechSpeechConfig,
    audioConfig: unknown,
  ) => AzureSpeechSpeechRecognizer) & {
    FromConfig: (
      speechConfig: AzureSpeechSpeechConfig,
      autoDetectConfig: unknown,
      audioConfig: unknown,
    ) => AzureSpeechSpeechRecognizer;
  };
};

export type AzureSpeechPushStream = {
  write(buffer: ArrayBuffer | Buffer): void;
  close(): void;
};

export type AzureSpeechSpeechConfig = {
  speechRecognitionLanguage: string;
  setProperty(propertyId: number, value: string): void;
};

export type AzureSpeechSpeechRecognizer = {
  recognizing: (sender: unknown, event: AzureSpeechRecognitionEvent) => void;
  recognized: (sender: unknown, event: AzureSpeechRecognitionEvent) => void;
  canceled: (sender: unknown, event: AzureSpeechCancellationEvent) => void;
  sessionStarted: (sender: unknown, event: unknown) => void;
  sessionStopped: (sender: unknown, event: unknown) => void;
  speechStartDetected: (sender: unknown, event: unknown) => void;
  startContinuousRecognitionAsync(success?: () => void, error?: (msg: string) => void): void;
  stopContinuousRecognitionAsync(success?: () => void, error?: (msg: string) => void): void;
  close(): void;
};

export type AzureSpeechRecognitionEvent = {
  result?: {
    text?: string;
    reason?: number;
  };
};

export type AzureSpeechCancellationEvent = {
  reason?: number;
  errorDetails?: string;
  errorCode?: number;
};
