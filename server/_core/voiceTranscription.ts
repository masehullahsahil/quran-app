/**
 * Voice transcription helper backed by OpenAI's Whisper transcription API
 * (POST /v1/audio/transcriptions). Requires OPENAI_API_KEY.
 *
 * Takes the audio bytes directly, so transcription depends on nothing but
 * OPENAI_API_KEY — no storage bucket, no publicly reachable URL.
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Send it to your tRPC procedure (e.g. base64-encoded)
 * 3. Decode it to a Buffer server side and pass it straight to transcribeAudio
 *
 * Example usage:
 * ```ts
 * // Server side, inside a tRPC procedure
 * const audio = Buffer.from(input.audioBase64, "base64");
 * const result = await transcribeAudio({
 *   audio,
 *   mimeType: input.mimeType, // e.g. "audio/webm"
 *   language: 'en', // optional
 *   prompt: 'Acme Corp, Q3 roadmap' // optional; see the note on prompts below
 * });
 * ```
 */
import { ENV } from "./env";

export const MAX_AUDIO_BYTES = 16 * 1024 * 1024; // OpenAI's upload limit is 25MB; this is the app's own cap

export type TranscribeOptions = {
  audio: Buffer | Uint8Array; // Raw audio bytes
  mimeType: string; // MIME type of those bytes, e.g. "audio/webm" — decides the filename extension sent to Whisper
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  // Optional priming text for Whisper. This is NOT an instruction — Whisper
  // treats it as the transcript that precedes the audio, so it must be written
  // in the same language as the audio and should only carry vocabulary hints
  // (names, jargon, spellings). Omit it unless there is such a hint to give.
  prompt?: string;
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse; // Return native Whisper API response directly

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

/**
 * Transcribe audio to text using OpenAI's Whisper transcription endpoint
 *
 * @param options - Audio data and metadata
 * @returns Transcription result or error
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // Step 1: Validate environment configuration
    if (!ENV.openaiApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
        details: "OPENAI_API_KEY is not set"
      };
    }

    // Step 2: Validate the supplied audio
    const { audio, mimeType } = options;

    if (!audio.byteLength) {
      return {
        error: "Audio file is empty",
        code: "INVALID_FORMAT",
        details: "No audio bytes were supplied"
      };
    }

    const sizeMB = audio.byteLength / (1024 * 1024);
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
        details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is ${MAX_AUDIO_BYTES / (1024 * 1024)}MB`
      };
    }

    // Step 3: Create FormData for multipart upload to Whisper API
    const formData = new FormData();

    // Create a Blob from the buffer and append to form
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audio)], { type: mimeType });
    formData.append("file", audioBlob, filename);
    
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    if (options.language) formData.append("language", options.language);
    
    // Only forward a prompt the caller actually asked for. Whisper's `prompt`
    // is decoder priming, not an instruction: the text is fed to the model as
    // if it were the transcript preceding this audio, so OpenAI's guidance is
    // that it must be written in the same language as the audio. The English
    // "Transcribe the user's voice to text…" default that used to be generated
    // here primed an English decoder for non-English speech, which pushes the
    // model toward translating instead of transcribing. `language` below is the
    // supported way to tell Whisper what it is listening to.
    if (options.prompt) formData.append("prompt", options.prompt);

    // Step 4: Call the transcription service
    const fullUrl = `${ENV.openaiBaseUrl.replace(/\/$/, "")}/audio/transcriptions`;

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.openaiApiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`
      };
    }

    // Step 5: Parse and return the transcription result
    const whisperResponse = await response.json() as WhisperResponse;
    
    // Validate response structure
    if (!whisperResponse.text || typeof whisperResponse.text !== 'string') {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Transcription service returned an invalid response format"
      };
    }

    return whisperResponse; // Return native Whisper API response directly

  } catch (error) {
    // Handle unexpected errors
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred"
    };
  }
}

/**
 * Helper function to get file extension from MIME type
 *
 * Whisper infers the container from the filename, so this has to survive the
 * parameterised types MediaRecorder produces (e.g. `audio/webm;codecs=opus`).
 */
function getFileExtension(mimeType: string): string {
  const baseType = mimeType.split(";")[0].trim().toLowerCase();
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
  };
  
  return mimeToExt[baseType] || 'audio';
}

/**
 * Example tRPC procedure implementation:
 * 
 * ```ts
 * // In server/routers.ts
 * import { transcribeAudio } from "./_core/voiceTranscription";
 * 
 * export const voiceRouter = router({
 *   transcribe: protectedProcedure
 *     .input(z.object({
 *       audioBase64: z.string(),
 *       mimeType: z.string(),
 *       language: z.string().optional(),
 *     }))
 *     .mutation(async ({ input, ctx }) => {
 *       const result = await transcribeAudio({
 *         audio: Buffer.from(input.audioBase64, "base64"),
 *         mimeType: input.mimeType,
 *         language: input.language,
 *       });
 *
 *       // Check if it's an error
 *       if ('error' in result) {
 *         throw new TRPCError({
 *           code: 'BAD_REQUEST',
 *           message: result.error,
 *           cause: result,
 *         });
 *       }
 *
 *       // Optionally save transcription to database
 *       await db.insert(transcriptions).values({
 *         userId: ctx.user.id,
 *         text: result.text,
 *         duration: result.duration,
 *         language: result.language,
 *         createdAt: new Date(),
 *       });
 *
 *
 *       return result;
 *     }),
 * });
 * ```
 */
