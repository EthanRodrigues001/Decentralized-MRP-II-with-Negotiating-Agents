export const ITEM_CATEGORY = "Raw Materials";

export type SupplierName = string;

export const GATEWAY_AGENT = "Gateway" as const;
export const EXPLANATION_AGENT = "ExplanationAgent" as const;
export const HUMAN_AGENT = "You" as const;

export type Performative =
  | "CFP"
  | "PROPOSE"
  | "REFUSE"
  | "REQUEST_APPROVAL"
  | "APPROVE"
  | "REJECT"
  | "ACCEPT_PROPOSAL"
  | "REJECT_PROPOSAL"
  | "EXPLAIN";

export interface SupplierStats {
  supplier: SupplierName;
  historyCount: number;
  avgLeadTimeDays: number | null;
  avgUnitPrice: number;
  avgNegotiatedPrice: number;
  defectRatePercent: number | null;
  compliancePercent: number;
  maxHistoricalQuantity: number;
}

export interface CfpPayload {
  itemCategory: string;
  quantity: number;
  dueInDays: number;
  replyBy: string;
  requestText?: string;
}

export interface ProposePayload {
  supplier: SupplierName;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  leadTimeDays: number;
  reliabilityScore: number;
  defectRatePercent: number;
  compliancePercent: number;
  historyCount: number;
  holdToken: string;
  expiresAt: string;
  score?: number;
}

export interface RefusePayload {
  supplier: SupplierName;
  reason: string;
}

export interface RequestApprovalPayload {
  proposals: ProposePayload[];
  recommendedSupplier: SupplierName;
}

export interface NegotiationMessage {
  id: string;
  negotiationId: string;
  seq: number;
  performative: Performative;
  sender: string;
  receiver: string;
  payload: unknown;
  narration: string | null;
  createdAt: string;
}

export type AgentRole = "supplier" | "gateway" | "explanation" | "human";
export type AgentStatus = "idle" | "spawning" | "running" | "done";

export interface AgentHandle {
  id: string;
  role: AgentRole;
  label: string;
  historyCount?: number;
}

// Streaming protocol between the orchestration generator (server) and the
// live console (client) — one JSON object per newline, so the chat can show
// tokens arriving and the graph can show an agent's running/done state as it
// actually happens, instead of only after a full round trip completes.
export type StreamEvent =
  | { type: "agent_spawn"; agent: AgentHandle }
  | { type: "agent_status"; agentId: string; status: AgentStatus }
  | { type: "message"; message: NegotiationMessage }
  | { type: "narration_delta"; messageId: string; delta: string }
  | { type: "narration_done"; messageId: string; text: string }
  | { type: "negotiation_id"; negotiationId: string }
  | { type: "done" }
  | { type: "error"; message: string };
