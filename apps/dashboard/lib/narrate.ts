import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import type { ProposePayload, RefusePayload } from "@/lib/types";
import { DEFAULT_GEMINI_MODEL, isValidGeminiModel } from "@/lib/models";
import { recordModelUsage } from "@/lib/model-usage";

// Every function here only ever narrates numbers the caller already computed
// deterministically (lib/bidding.ts). It never picks a price, a lead time, or
// a winner — see docs/02-design/agents-and-negotiation.md "LLM boundary".
// If Gemini is unavailable, callers still get a grounded sentence from the
// fallback: planning/negotiation must work with the LLM off.

async function* fallbackStream(text: string): AsyncGenerator<string> {
  yield text;
}

function proposalFallback(p: ProposePayload): string {
  return (
    `Based on ${p.historyCount} past Raw Materials orders, my average negotiated price is ` +
    `$${p.unitPrice}/unit and average lead time is ${p.leadTimeDays} days, with a ` +
    `${p.defectRatePercent}% defect rate and ${p.compliancePercent}% policy compliance — ` +
    `so I'm offering ${p.quantity} units at $${p.totalPrice} total, delivered in ${p.leadTimeDays} days.`
  );
}

function decisionFallback(winner: ProposePayload, losers: ProposePayload[]): string {
  return losers.length > 0
    ? `${winner.supplier} was approved: lowest weighted score across cost, tardiness, lead time and risk among ${
        losers.length + 1
      } proposals.`
    : `${winner.supplier} was approved as the only valid proposal.`;
}

function explanationFallback(proposals: ProposePayload[]): string {
  const sorted = [...proposals].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return (
    `Comparing ${sorted.length} proposal(s): ` +
    sorted
      .map((p) => `${p.supplier} scores ${p.score} ($${p.totalPrice}, ${p.leadTimeDays}d)`)
      .join("; ") +
    `. ${sorted[0]?.supplier ?? "no supplier"} currently ranks best.`
  );
}

async function textStreamOrFallback(
  prompt: string,
  fallback: string,
  modelId?: string
): Promise<AsyncGenerator<string>> {
  const model = isValidGeminiModel(modelId) ? modelId : DEFAULT_GEMINI_MODEL;

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    await recordModelUsage(model, true);
    return fallbackStream(fallback);
  }

  try {
    const result = streamText({ model: google(model), prompt });
    // Touch the stream once, with a timeout, so a hung request still falls
    // back instead of leaving the chat stuck on "thinking" forever.
    const iterator = result.textStream[Symbol.asyncIterator]();
    const first = await Promise.race([
      iterator.next(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (first === null || first.done) {
      await recordModelUsage(model, true);
      return fallbackStream(fallback);
    }

    await recordModelUsage(model, false);
    async function* resume() {
      yield first!.value as string;
      while (true) {
        const { value, done } = await iterator.next();
        if (done) return;
        yield value;
      }
    }
    return resume();
  } catch {
    await recordModelUsage(model, true);
    return fallbackStream(fallback);
  }
}

export function streamProposalNarration(p: ProposePayload, modelId?: string) {
  return textStreamOrFallback(
    `You are a supplier agent named ${p.supplier} explaining your own bid in one short, plain sentence. ` +
      `Use ONLY these facts, do not invent or change any numbers: ` +
      `history=${p.historyCount} past orders, avgUnitPrice=$${p.unitPrice}, leadTimeDays=${p.leadTimeDays}, ` +
      `defectRate=${p.defectRatePercent}%, compliance=${p.compliancePercent}%, ` +
      `offering quantity=${p.quantity} for totalPrice=$${p.totalPrice}. ` +
      `Speak in first person as the supplier. One sentence only, no markdown.`,
    proposalFallback(p),
    modelId
  );
}

export async function narrateRefusal(r: RefusePayload): Promise<string> {
  return `${r.supplier} refused: ${r.reason}.`;
}

export function streamDecisionNarration(
  winner: ProposePayload,
  losers: ProposePayload[],
  modelId?: string
) {
  return textStreamOrFallback(
    `Explain in one short plain sentence why ${winner.supplier} (score ${winner.score}) was chosen ` +
      `over ${losers.map((l) => `${l.supplier} (score ${l.score})`).join(", ") || "no other bidders"}. ` +
      `Lower score is better (weighted: 45% cost, 35% tardiness, 15% lead time, 5% risk). ` +
      `Do not invent facts beyond the scores given. No markdown.`,
    decisionFallback(winner, losers),
    modelId
  );
}

// The ExplanationAgent: a read-only agent that only ever summarizes structured
// facts it's handed (the scored proposals) — it never decides or scores
// anything itself. See docs/02-design/agents-and-negotiation.md "ExplanationAgent" row.
export function streamExplanationNarration(proposals: ProposePayload[], modelId?: string) {
  const sorted = [...proposals].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const facts = sorted
    .map(
      (p) =>
        `${p.supplier}: score=${p.score}, totalPrice=$${p.totalPrice}, leadTimeDays=${p.leadTimeDays}, reliability=${p.reliabilityScore}`
    )
    .join(" | ");

  return textStreamOrFallback(
    `You are a neutral ExplanationAgent. You never decide anything, you only summarize facts you are given. ` +
      `Here are ${sorted.length} scored supplier proposals (lower score is better): ${facts}. ` +
      `In 1-2 short plain sentences, compare them for a human who must approve one. ` +
      `Do not invent any numbers beyond what's given. No markdown.`,
    explanationFallback(proposals),
    modelId
  );
}
