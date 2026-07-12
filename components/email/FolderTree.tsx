import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export type EmailFolder = "inbox" | "sent";

interface FolderTreeProps {
  folder: EmailFolder;
  onSelect: (folder: EmailFolder) => void;
  onComposeClick: () => void;
}

const FOLDERS: { id: EmailFolder; label: string; icon: IconName }[] = [
  { id: "inbox", label: "Inbox", icon: "mail" },
  { id: "sent", label: "Sent", icon: "send" },
];

export function FolderTree({ folder, onSelect, onComposeClick }: FolderTreeProps) {
  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-surface p-3">
      <button
        type="button"
        onClick={onComposeClick}
        className="mb-4 flex items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-600"
      >
        <Icon name="edit" className="h-4 w-4" />
        Compose
      </button>
      <nav className="space-y-1">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-medium transition-colors duration-150",
              folder === f.id
                ? "bg-primary/10 text-primary"
                : "text-text-secondary hover:bg-background hover:text-text",
            )}
          >
            <Icon name={f.icon} className="h-5 w-5 shrink-0" />
            {f.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
