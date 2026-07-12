import { Avatar } from "@/components/common/Avatar";
import { Table } from "@/components/common/Table";
import { RoleSelector } from "@/components/admin/RoleSelector";
import { formatDate } from "@/lib/utils";
import type { User, UserRole } from "@/lib/types";

interface UserRowProps {
  user: User;
  onRoleChange: (role: UserRole) => void;
  disabled?: boolean;
}

export function UserRow({ user, onRoleChange, disabled }: UserRowProps) {
  return (
    <Table.Row>
      <Table.Cell className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar name={user.name ?? user.email} size="sm" />
          <div>
            <p className="text-sm font-medium text-text">{user.name ?? "—"}</p>
            <p className="text-xs text-text-secondary">{user.email}</p>
          </div>
        </div>
      </Table.Cell>
      <Table.Cell className="px-3 py-2 text-sm text-text-secondary">{formatDate(user.created_at)}</Table.Cell>
      <Table.Cell className="px-3 py-2">
        <RoleSelector value={user.role} onChange={onRoleChange} disabled={disabled} />
      </Table.Cell>
    </Table.Row>
  );
}
