"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Input, Textarea } from "@/components/common/Input";
import { useSendEmail } from "@/lib/hooks";

export default function ComposePage() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const sendEmail = useSendEmail();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!to.trim() || !body.trim()) return;
    await sendEmail.mutateAsync({ to, subject, body });
    router.push("/email");
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-text">Compose</h1>
      <Card variant="outline" className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="compose-to" className="mb-1 block text-sm font-medium text-text">
              To
            </label>
            <Input
              id="compose-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="contact@company.com"
              required
            />
          </div>
          <div>
            <label htmlFor="compose-subject" className="mb-1 block text-sm font-medium text-text">
              Subject
            </label>
            <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label htmlFor="compose-body" className="mb-1 block text-sm font-medium text-text">
              Message
            </label>
            <Textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              required
            />
          </div>
          {sendEmail.isError && (
            <p className="text-sm text-danger">{(sendEmail.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/email")}>
              Cancel
            </Button>
            <Button type="submit" disabled={sendEmail.isPending || !to.trim() || !body.trim()}>
              {sendEmail.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
