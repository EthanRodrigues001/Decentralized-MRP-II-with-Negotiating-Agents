"use client";

import { useState } from "react";
import { ArrowUpIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export function TaskComposer({
  onSubmit,
  disabled,
  placeholder = "Describe what you need, e.g. '10 dining tables for Acme due in 14 days' or '3 foam padding'",
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText("");
  }

  return (
    <InputGroup>
      <InputGroupInput
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={submit} disabled={disabled || text.trim().length === 0}>
          {disabled ? <Spinner /> : <ArrowUpIcon data-icon="inline-start" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
