import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/common/Card";
import { OrganizationSettings } from "@/components/admin/OrganizationSettings";
import { UserManagement } from "@/components/admin/UserManagement";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-text">Admin</h1>

      <Card variant="outline" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-text">Organization</h2>
        <OrganizationSettings />
      </Card>

      <Card variant="outline">
        <h2 className="mb-3 text-sm font-semibold text-text">Users</h2>
        <UserManagement />
      </Card>
    </div>
  );
}
