import { Select } from "@/components/common/Input";
import type { UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["admin", "member", "viewer"];

interface RoleSelectorProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as UserRole)}
      disabled={disabled}
      className="w-32"
    >
      {ROLES.map((role) => (
        <option key={role} value={role} className="capitalize">
          {role}
        </option>
      ))}
    </Select>
  );
}
