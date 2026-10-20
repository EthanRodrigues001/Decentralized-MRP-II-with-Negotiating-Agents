import { getActiveSupplierNames } from "@/lib/suppliers";
import { getSupplierStats } from "@/lib/supplier-stats";
import { computeBidOrRefusal, scoreProposals } from "@/lib/bidding";
import {
  streamProposalNarration,
  streamDecisionNarration,
  streamExplanationNarration,
  narrateRefusal,
} from "@/lib/narrate";
import {
  addMessage,
  createNegotiation,
  getLatestApproval,
  setMessageNarration,
  setNegotiationStatus,
} from "@/lib/negotiation-db";
import {
  EXPLANATION_AGENT,
  GATEWAY_AGENT,
  HUMAN_AGENT,
  ITEM_CATEGORY,
  type CfpPayload,
  type ProposePayload,
  type RequestApprovalPayload,
  type StreamEvent,
  type SupplierName,
} from "@/lib/types";

async function* streamNarrationIntoMessage(
  messageId: string,
  chunks: AsyncGenerator<string>
): AsyncGenerator<StreamEvent> {
  let full = "";
  for await (const delta of chunks) {
    full += delta;
    yield { type: "narration_delta", messageId, delta };
  }
  await setMessageNarration(messageId, full);
  yield { type: "narration_done", messageId, text: full };
}

export async function* startNegotiationStream(
  quantity: number,
  dueInDays: number,
  requestText?: string,
  modelId?: string
): AsyncGenerator<StreamEvent> {
  const negotiationId = await createNegotiation(quantity, dueInDays);
  yield { type: "negotiation_id", negotiationId };

  yield {
    type: "agent_spawn",
    agent: { id: "gateway", role: "gateway", label: GATEWAY_AGENT },
  };
  yield { type: "agent_status", agentId: "gateway", status: "running" };

  const suppliers = await getActiveSupplierNames();

  const cfpPayload: CfpPayload = {
    itemCategory: ITEM_CATEGORY,
    quantity,
    dueInDays,
    replyBy: new Date(Date.now() + 30_000).toISOString(),
    requestText,
  };
  const cfp = await addMessage(negotiationId, "CFP", GATEWAY_AGENT, "SupplierAgents", cfpPayload, null);
  yield { type: "message", message: cfp };
  yield { type: "agent_status", agentId: "gateway", status: "done" };

  const proposals: ProposePayload[] = [];

  for (const supplier of suppliers) {
    yield {
      type: "agent_spawn",
      agent: { id: supplier, role: "supplier", label: supplier },
    };
    yield { type: "agent_status", agentId: supplier, status: "spawning" };

    const stats = await getSupplierStats(supplier);
    yield { type: "agent_status", agentId: supplier, status: "running" };
    const result = computeBidOrRefusal(stats, quantity, dueInDays);

    if ("refuse" in result) {
      const narration = await narrateRefusal(result.refuse);
      const msg = await addMessage(
        negotiationId,
        "REFUSE",
        supplier,
        GATEWAY_AGENT,
        result.refuse,
        narration
      );
      yield { type: "message", message: msg };
    } else {
      const msg = await addMessage(
        negotiationId,
        "PROPOSE",
        supplier,
        GATEWAY_AGENT,
        result.propose,
        null
      );
      yield { type: "message", message: msg };
      const chunks = await streamProposalNarration(result.propose, modelId);
      yield* streamNarrationIntoMessage(msg.id, chunks);
      proposals.push(result.propose);
    }
    yield { type: "agent_status", agentId: supplier, status: "done" };
  }

  if (proposals.length === 0) {
    await setNegotiationStatus(negotiationId, "rejected");
    yield { type: "done" };
    return;
  }

  const scored = scoreProposals(proposals, dueInDays).sort(
    (a, b) => (a.score ?? 0) - (b.score ?? 0)
  );

  yield {
    type: "agent_spawn",
    agent: { id: "explanation", role: "explanation", label: EXPLANATION_AGENT },
  };
  yield { type: "agent_status", agentId: "explanation", status: "running" };
  const explainMsg = await addMessage(
    negotiationId,
    "EXPLAIN",
    EXPLANATION_AGENT,
    HUMAN_AGENT,
    { proposals: scored },
    null
  );
  yield { type: "message", message: explainMsg };
  const explainChunks = await streamExplanationNarration(scored, modelId);
  yield* streamNarrationIntoMessage(explainMsg.id, explainChunks);
  yield { type: "agent_status", agentId: "explanation", status: "done" };

  const approvalPayload: RequestApprovalPayload = {
    proposals: scored,
    recommendedSupplier: scored[0].supplier,
  };
  const approvalMsg = await addMessage(
    negotiationId,
    "REQUEST_APPROVAL",
    GATEWAY_AGENT,
    HUMAN_AGENT,
    approvalPayload,
    null
  );
  yield { type: "message", message: approvalMsg };

  yield { type: "done" };
}

export async function* decideNegotiationStream(
  negotiationId: string,
  chosenSupplier: SupplierName | null,
  modelId?: string
): AsyncGenerator<StreamEvent> {
  const approval = await getLatestApproval(negotiationId);
  if (!approval) {
    yield { type: "error", message: "no pending approval for this negotiation" };
    return;
  }
  const proposals = approval.proposals;

  if (!chosenSupplier) {
    const rejectMsg = await addMessage(negotiationId, "REJECT", HUMAN_AGENT, GATEWAY_AGENT, {}, null);
    yield { type: "message", message: rejectMsg };

    for (const p of proposals) {
      const msg = await addMessage(
        negotiationId,
        "REJECT_PROPOSAL",
        GATEWAY_AGENT,
        p.supplier,
        { holdToken: p.holdToken },
        "Hold released — no proposal was approved."
      );
      yield { type: "message", message: msg };
      yield { type: "agent_status", agentId: p.supplier, status: "done" };
    }
    await setNegotiationStatus(negotiationId, "rejected");
    yield { type: "done" };
    return;
  }

  const approveMsg = await addMessage(
    negotiationId,
    "APPROVE",
    HUMAN_AGENT,
    GATEWAY_AGENT,
    { chosenSupplier },
    null
  );
  yield { type: "message", message: approveMsg };

  const winner = proposals.find((p) => p.supplier === chosenSupplier)!;
  const losers = proposals.filter((p) => p.supplier !== chosenSupplier);

  yield { type: "agent_status", agentId: winner.supplier, status: "running" };
  const acceptMsg = await addMessage(
    negotiationId,
    "ACCEPT_PROPOSAL",
    GATEWAY_AGENT,
    winner.supplier,
    { holdToken: winner.holdToken },
    null
  );
  yield { type: "message", message: acceptMsg };
  const decisionChunks = await streamDecisionNarration(winner, losers, modelId);
  yield* streamNarrationIntoMessage(acceptMsg.id, decisionChunks);
  yield { type: "agent_status", agentId: winner.supplier, status: "done" };

  for (const loser of losers) {
    const msg = await addMessage(
      negotiationId,
      "REJECT_PROPOSAL",
      GATEWAY_AGENT,
      loser.supplier,
      { holdToken: loser.holdToken },
      "Hold released."
    );
    yield { type: "message", message: msg };
    yield { type: "agent_status", agentId: loser.supplier, status: "done" };
  }

  await setNegotiationStatus(negotiationId, "committed", chosenSupplier);
  yield { type: "done" };
}
