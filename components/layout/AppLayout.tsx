import { type ReactNode } from "react";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { TopBar } from "@/components/layout/TopBar";

interface AppLayoutProps {
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
  children: ReactNode;
}

export function AppLayout({ user, children }: AppLayoutProps) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <LeftSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
