import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, isValidGeminiModel } from "@/lib/models";
import { recordModelUsage } from "@/lib/model-usage";

// This is the one place the LLM is allowed to turn a plain-language request
// into a draft structured object — explicitly permitted by
// docs/02-design/agents-and-negotiation.md ("LLM boundary"). It never decides
// a negotiation outcome; it only fills in quantity/dueInDays so a task can be
// created. If Gemini is unavailable, a fixed default is used instead of
// blocking task creation.

const IntakeSchema = z.object({
  quantity: z.number().int().positive(),
  dueInDays: z.number().int().positive(),
  summary: z.string().describe("a short 4-8 word label for this task, e.g. 'Raw materials for Q4 run'"),
});

export type IntakeResult = z.infer<typeof IntakeSchema>;

function fallback(text: string): IntakeResult {
  const qtyMatch = text.match(/(\d{2,6})/);
  const dayMatch = text.match(/(\d{1,3})\s*day/i);
  return {
    quantity: qtyMatch ? Number(qtyMatch[1]) : 1000,
    dueInDays: dayMatch ? Number(dayMatch[1]) : 14,
    summary: text.slice(0, 60),
  };
}

export async function parseTaskRequest(text: string, modelId?: string): Promise<IntakeResult> {
  const model = isValidGeminiModel(modelId) ? modelId : DEFAULT_GEMINI_MODEL;

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    await recordModelUsage(model, true);
    return fallback(text);
  }

  try {
    const { object } = await Promise.race([
      generateObject({
        model: google(model),
        schema: IntakeSchema,
        prompt:
          `Extract a Raw Materials procurement request from this message: "${text}". ` +
          `If a quantity (units) isn't given, use a reasonable default like 1000. ` +
          `If a due date/lead time isn't given, use a reasonable default like 14 days.`,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    await recordModelUsage(model, false);
    return object;
  } catch {
    await recordModelUsage(model, true);
    return fallback(text);
  }
}
