"use client";

import { useEffect } from "react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Spinner } from "@/components/common/Spinner";
import { useSuggestReply } from "@/lib/hooks";

interface AIReplyModalProps {
  open: boolean;
  emailId: string;
  onClose: () => void;
  onUse: (suggestion: string) => void;
}

export function AIReplyModal({ open, emailId, onClose, onUse }: AIReplyModalProps) {
  const suggest = useSuggestReply();

  useEffect(() => {
    if (open) {
      suggest.mutate(emailId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emailId]);

  return (
    <Modal open={open} onClose={onClose} title="AI Reply Suggestion">
      <div className="space-y-4">
        {suggest.isPending && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {suggest.isError && (
          <p className="text-sm text-danger">{(suggest.error as Error).message}</p>
        )}
        {suggest.data && (
          <p className="whitespace-pre-wrap rounded border border-border bg-background p-3 text-sm text-text">
            {suggest.data.suggestion}
          </p>
        )}
        <Modal.Footer>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!suggest.data?.suggestion}
            onClick={() => {
              if (suggest.data?.suggestion) onUse(suggest.data.suggestion);
              onClose();
            }}
          >
            Use This
          </Button>
        </Modal.Footer>
      </div>
    </Modal>
  );
}
