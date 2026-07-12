"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { CompanyPanel } from "@/components/email/CompanyPanel";
import { EmailDetail } from "@/components/email/EmailDetail";
import { EmailList } from "@/components/email/EmailList";
import { FolderTree, type EmailFolder } from "@/components/email/FolderTree";
import { useEmails } from "@/lib/hooks";

export default function EmailPage() {
  const router = useRouter();
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const { data: emails = [], isLoading } = useEmails(folder);
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) ?? null;

  return (
    <>
      <FolderTree
        folder={folder}
        onSelect={(f) => {
          setFolder(f);
          setSelectedEmailId(null);
        }}
        onComposeClick={() => router.push("/email/compose")}
      />

      <div className="flex w-[320px] shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h1 className="text-sm font-semibold capitalize text-text">{folder}</h1>
        </div>
        <EmailList
          emails={emails}
          isLoading={isLoading}
          selectedEmailId={selectedEmailId}
          onSelect={setSelectedEmailId}
        />
      </div>

      {selectedEmailId ? (
        <>
          <EmailDetail emailId={selectedEmailId} />
          <RightSidebar title="Company">
            <CompanyPanel companyId={selectedEmail?.company_id ?? null} />
          </RightSidebar>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
          Select an email to view it.
        </div>
      )}
    </>
  );
}
