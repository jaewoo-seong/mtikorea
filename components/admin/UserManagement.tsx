"use client";

import { useState } from "react";
import { Spinner } from "@/components/common/Spinner";
import { Table } from "@/components/common/Table";
import { UserRow } from "@/components/admin/UserRow";
import { useAdminUsers, useUpdateUserRole } from "@/lib/hooks";
import type { UserRole } from "@/lib/types";

export function UserManagement() {
  const { data: users = [], isLoading } = useAdminUsers();
  const updateRole = useUpdateUserRole();
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(id: string, role: UserRole) {
    setError(null);
    try {
      await updateRole.mutateAsync({ id, role });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>User</Table.HeaderCell>
            <Table.HeaderCell>Joined</Table.HeaderCell>
            <Table.HeaderCell>Role</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onRoleChange={(role) => handleRoleChange(user.id, role)}
              disabled={updateRole.isPending}
            />
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
