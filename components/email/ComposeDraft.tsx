"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Icon } from "@/components/common/Icon";
import { Textarea } from "@/components/common/Input";
import { AIReplyModal } from "@/components/email/AIReplyModal";
import { useReplyToEmail } from "@/lib/hooks";

export function ComposeDraft({ emailId, onSent }: { emailId: string; onSent?: () => void }) {
  const [body, setBody] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const reply = useReplyToEmail();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    await reply.mutateAsync({ id: emailId, body });
    setBody("");
    onSent?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-border pt-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={4}
      />
      {reply.isError && <p className="text-sm text-danger">{(reply.error as Error).message}</p>}
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAiOpen(true)}>
          <Icon name="sparkle" className="h-4 w-4" />
          AI Suggest
        </Button>
        <Button type="submit" size="sm" disabled={reply.isPending || !body.trim()}>
          {reply.isPending ? "Sending…" : "Send Reply"}
        </Button>
      </div>

      <AIReplyModal
        open={aiOpen}
        emailId={emailId}
        onClose={() => setAiOpen(false)}
        onUse={(suggestion) => setBody(suggestion)}
      />
    </form>
  );
}
