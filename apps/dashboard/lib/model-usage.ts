import { sql } from "@/lib/db";

// Google doesn't expose a "quota remaining" endpoint for the Gemini API —
// per-account rate limits depend on your usage tier and are only visible by
// logging into Google AI Studio (aistudio.google.com/rate-limit) yourself.
// What we CAN show honestly is our own app's real call volume per model, so
// that's what this tracks — not a fabricated "limit left" number.

export async function recordModelUsage(modelId: string, wasFallback: boolean): Promise<void> {
  await sql`
    INSERT INTO model_usage (model_id, day, calls, fallbacks)
    VALUES (${modelId}, CURRENT_DATE, 1, ${wasFallback ? 1 : 0})
    ON CONFLICT (model_id, day)
    DO UPDATE SET
      calls = model_usage.calls + 1,
      fallbacks = model_usage.fallbacks + ${wasFallback ? 1 : 0}
  `;
}

export interface ModelUsageToday {
  modelId: string;
  calls: number;
  fallbacks: number;
}

export async function getModelUsageToday(): Promise<ModelUsageToday[]> {
  const rows = await sql`
    SELECT model_id, calls, fallbacks FROM model_usage WHERE day = CURRENT_DATE
  `;
  return (rows as { model_id: string; calls: number; fallbacks: number }[]).map((r) => ({
    modelId: r.model_id,
    calls: r.calls,
    fallbacks: r.fallbacks,
  }));
}
