import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, isValidGeminiModel } from "@/lib/models";
import { recordModelUsage } from "@/lib/model-usage";
import { matchProduct } from "@/lib/bom";
import { parseCustomer, parseRecurrence } from "@/lib/intake-parse";
import { parsePriority } from "@/lib/chat-command";
import { matchMaterial } from "@/lib/material-request";

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

export type IntakeResult = z.infer<typeof IntakeSchema> & {
  productId?: string;
  productName?: string;
  everyDays?: number;
  customer?: string;
  priority?: number;
  /** order = a product from the catalogue, material = one raw material, unknown = nothing recognisable. */
  kind?: "order" | "material" | "unknown";
  materialId?: string;
  materialName?: string;
};

function fallback(text: string): IntakeResult {
  // A repeat interval ("every 2 weeks") is not the due date, and a due date is not the quantity.
  const clean = text.replace(/\bevery\s+\d{1,3}\s*\w+/gi, " ");
  const qtyMatch = clean.replace(/\d{1,3}\s*(day|week)s?/gi, " ").match(/(\d{1,6})/);
  const dayMatch = clean.match(/(\d{1,3})\s*day/i);
  return {
    quantity: qtyMatch ? Number(qtyMatch[1]) : 1000,
    dueInDays: dayMatch ? Number(dayMatch[1]) : 14,
    summary: text.slice(0, 60),
  };
}

// A message that names one of our furniture products is a customer order, not a
// raw-material request. Matching is plain keyword lookup, never the LLM.
export async function parseTaskRequest(text: string, modelId?: string): Promise<IntakeResult> {
  const product = await matchProduct(text);
  const priority = parsePriority(text);
  if (product) {
    const base = await parseQuantities(text, modelId);
    const everyDays = parseRecurrence(text);
    const customer = parseCustomer(text);
    return {
      ...base,
      kind: "order",
      priority,
      productId: product.id,
      productName: product.name,
      ...(everyDays ? { everyDays } : {}),
      ...(customer ? { customer } : {}),
    };
  }
  // A named raw material ("3 foam padding") is a direct material request.
  const material = await matchMaterial(text);
  if (material) {
    const base = await parseQuantities(text, modelId);
    return { ...base, kind: "material", priority, materialId: material.id, materialName: material.name };
  }
  // Nothing we can act on (e.g. a stray "ok"): do not invent an order.
  return { ...fallback(text), kind: "unknown" };
}

async function parseQuantities(text: string, modelId?: string): Promise<IntakeResult> {
  const model = isValidGeminiModel(modelId) ? modelId : DEFAULT_GEMINI_MODEL;

  // Numbers typed in the message are authoritative; the model is only for wording like "a dozen".
  if (/\d/.test(text)) return fallback(text);

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
          `Extract the quantity (units) and due date from this order or procurement request: "${text}". Ignore repeat intervals such as "every 2 weeks"; they are not the due date. ` +
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
