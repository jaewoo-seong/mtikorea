import { Input } from "@/components/common/Input";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, onChange }: SearchBoxProps) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search name, Korean name, or email…"
      className="max-w-xs"
    />
  );
}
