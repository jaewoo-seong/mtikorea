"use client";

import { LoadingBlock } from "@/components/common/LoadingBlock";
import { Table } from "@/components/common/Table";
import { UserRow } from "@/components/admin/UserRow";
import { useAdminUsers, useUpdateUserRole } from "@/lib/hooks";
import type { UserRole } from "@/lib/types";

export function UserManagement() {
  const { data: users = [], isLoading } = useAdminUsers();
  const updateRole = useUpdateUserRole();

  function handleRoleChange(id: string, role: UserRole) {
    updateRole.mutate({ id, role });
  }

  if (isLoading) {
    return <LoadingBlock />;
  }

  return (
    <div>
      {updateRole.isError && (
        <p className="mb-3 text-sm text-danger">
          {(updateRole.error as Error).message || "Failed to update role"}
        </p>
      )}
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
