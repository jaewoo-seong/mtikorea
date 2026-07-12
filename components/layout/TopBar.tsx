import { Input } from "@/components/common/Input";
import { UserMenu } from "@/components/layout/UserMenu";

interface TopBarProps {
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
}

export function TopBar({ user }: TopBarProps) {
  return (
    <header className="flex h-[var(--layout-topbar-height)] shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <div className="w-full max-w-sm">
        <Input type="search" placeholder="Search companies, emails, tasks…" />
      </div>
      <UserMenu name={user.name} email={user.email} image={user.image} />
    </header>
  );
}
