import { Input } from "@/components/common/Input";

interface IndustryFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function IndustryFilter({ value, onChange }: IndustryFilterProps) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Filter by industry…"
      className="w-48"
    />
  );
}
