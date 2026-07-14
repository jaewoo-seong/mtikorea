import { Spinner } from "@/components/common/Spinner";
import { cn } from "@/lib/utils";

interface LoadingBlockProps {
  className?: string;
}

export function LoadingBlock({ className }: LoadingBlockProps) {
  return (
    <div className={cn("flex justify-center py-8", className)}>
      <Spinner />
    </div>
  );
}
