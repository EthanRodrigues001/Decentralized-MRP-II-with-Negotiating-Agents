"use client";

import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import type {
  NegotiationMessage,
  ProposePayload,
  RequestApprovalPayload,
} from "@/lib/types";

function initials(name: string) {
  return name
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function bubbleVariant(performative: string): "default" | "tinted" | "outline" | "muted" {
  if (performative === "PROPOSE" || performative === "EXPLAIN" || performative === "ACCEPT_PROPOSAL")
    return "tinted";
  if (performative === "REQUEST_APPROVAL") return "outline";
  if (performative === "REFUSE" || performative === "REJECT_PROPOSAL") return "muted";
  return "default";
}

function MessageRow({
  message,
  isStreaming,
  onApprove,
}: {
  message: NegotiationMessage;
  isStreaming?: boolean;
  onApprove?: (supplier: string | null) => void;
}) {
  const isYou = message.sender === "You";
  const payload = message.payload as Record<string, unknown>;

  // System-only handoff notices read better as a divider than a chat bubble.
  if (message.performative === "REJECT_PROPOSAL") {
    return (
      <Marker variant="separator">
        <MarkerContent>
          {message.sender} → {message.receiver.replace(/_/g, " ")}: hold released
        </MarkerContent>
      </Marker>
    );
  }

  return (
    <Message align={isYou ? "end" : "start"}>
      <MessageAvatar>
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">{initials(message.sender)}</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="flex items-center gap-2">
          <span>{message.sender.replace(/_/g, " ")}</span>
          <span className="text-muted-foreground">→ {message.receiver.replace(/_/g, " ")}</span>
          <Badge variant="secondary" className="text-[10px]">
            {message.performative}
          </Badge>
        </MessageHeader>

        <Bubble variant={bubbleVariant(message.performative)} align={isYou ? "end" : "start"}>
          <BubbleContent>
            {message.performative === "CFP" && (
              <p>
                Requesting <b>{String(payload.quantity)}</b> units of{" "}
                <b>{String(payload.itemCategory)}</b>, due within{" "}
                <b>{String(payload.dueInDays)} days</b>.
                {typeof payload.requestText === "string" && payload.requestText && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    from: &ldquo;{payload.requestText}&rdquo;
                  </span>
                )}
              </p>
            )}

            {message.performative === "PROPOSE" && (
              <div className="flex flex-col gap-1">
                <p className="italic">
                  &ldquo;{message.narration}
                  {isStreaming && <Spinner className="inline-block size-3 ml-1" />}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground">
                  {String((payload as unknown as ProposePayload).quantity)} units · $
                  {String((payload as unknown as ProposePayload).totalPrice)} total · lead time{" "}
                  {String((payload as unknown as ProposePayload).leadTimeDays)}d · reliability{" "}
                  {String((payload as unknown as ProposePayload).reliabilityScore)}
                </p>
              </div>
            )}

            {message.performative === "REFUSE" && <p>{message.narration}</p>}

            {message.performative === "EXPLAIN" && (
              <p>
                {message.narration}
                {isStreaming && <Spinner className="inline-block size-3 ml-1" />}
              </p>
            )}

            {message.performative === "REQUEST_APPROVAL" && (
              <div className="flex flex-col gap-2">
                <p>Ranked by price, speed &amp; reliability — approve one, or reject all:</p>
                {(payload as unknown as RequestApprovalPayload).proposals.map((p, i) => (
                  <div
                    key={p.supplier}
                    className="flex items-center justify-between gap-3 rounded border px-2 py-1.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        {p.supplier.replace(/_/g, " ")}
                        {i === 0 && (
                          <Badge className="text-[9px]" variant="default">
                            Best overall
                          </Badge>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ${p.totalPrice.toLocaleString()} · {p.leadTimeDays}-day lead time ·{" "}
                        {Math.round(p.reliabilityScore * 100)}% reliable
                      </span>
                    </div>
                    <button
                      onClick={() => onApprove?.(p.supplier)}
                      className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/80"
                    >
                      Approve
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => onApprove?.(null)}
                  className="text-xs text-muted-foreground underline underline-offset-2 self-start"
                >
                  Reject all
                </button>
              </div>
            )}

            {message.performative === "APPROVE" && (
              <p>
                Approved <b>{String(payload.chosenSupplier).replace(/_/g, " ")}</b>.
              </p>
            )}

            {message.performative === "REJECT" && <p>Rejected all proposals.</p>}

            {message.performative === "ACCEPT_PROPOSAL" && (
              <p className="italic">
                &ldquo;{message.narration}
                {isStreaming && <Spinner className="inline-block size-3 ml-1" />}&rdquo;
              </p>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

export function ChatThread({
  messages,
  streamingIds,
  onApprove,
}: {
  messages: NegotiationMessage[];
  streamingIds: Set<string>;
  onApprove: (supplier: string | null) => void;
}) {
  if (messages.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>No task selected</EmptyTitle>
          <EmptyDescription>
            Describe what you need below — e.g. &ldquo;need 1500 units of raw materials, due in
            10 days&rdquo; — to start a new decentralized negotiation.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="h-full">
        <MessageScrollerViewport>
          <MessageScrollerContent className="flex flex-col gap-4 p-4">
            {messages.map((m) => (
              <MessageScrollerItem key={m.id} messageId={m.id}>
                <MessageRow
                  message={m}
                  isStreaming={streamingIds.has(m.id)}
                  onApprove={onApprove}
                />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
