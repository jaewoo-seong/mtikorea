"use client";

import { Spinner } from "@/components/common/Spinner";
import { ComposeDraft } from "@/components/email/ComposeDraft";
import { EmailThread } from "@/components/email/EmailThread";
import { InternalNoteBox } from "@/components/email/InternalNoteBox";
import { useEmail } from "@/lib/hooks";

export function EmailDetail({ emailId }: { emailId: string }) {
  const { data, isLoading } = useEmail(emailId);

  if (isLoading || !data) {
    return (
      <div className="flex min-w-0 flex-1 justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
      <h2 className="text-lg font-semibold text-text">{data.subject || "(no subject)"}</h2>
      <EmailThread emails={data.thread_emails.length > 0 ? data.thread_emails : [data]} />
      <InternalNoteBox emailId={data.id} notes={data.notes} />
      <ComposeDraft emailId={data.id} />
    </div>
  );
}
