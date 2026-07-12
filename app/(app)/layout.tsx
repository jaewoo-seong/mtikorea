import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppLayout } from "@/components/layout/AppLayout";

export default async function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppLayout
      user={{
        name: session.user.name ?? session.user.email ?? "Unknown",
        email: session.user.email ?? "",
        image: session.user.image,
      }}
    >
      {children}
    </AppLayout>
  );
}
