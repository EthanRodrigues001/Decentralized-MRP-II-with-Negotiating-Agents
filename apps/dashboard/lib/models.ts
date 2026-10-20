// Verified against https://ai.google.dev/gemini-api/docs/models (2026-09-30) —
// only real, currently-listed text-capable Gemini models. Every model in this
// generation happens to share the same context window; the toggle is really
// choosing a speed/cost/quality tier, not a bigger context.
export interface GeminiModelOption {
  id: string;
  label: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  description: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    description: "Fastest & cheapest — current default",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    description: "Newer lite tier",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    description: "Balanced quality & speed",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    description: "Latest & most capable Flash",
  },
];

export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].id;

export function isValidGeminiModel(id: unknown): id is string {
  return typeof id === "string" && GEMINI_MODELS.some((m) => m.id === id);
}
