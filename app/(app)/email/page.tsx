import { Card } from "@/components/common/Card";

export default function EmailPage() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold text-text">Email</h1>
      <Card variant="outline">
        <p className="text-sm text-text-secondary">
          Foundation phase placeholder — inbox, threading, and company auto-linking land in the
          email client build phase.
        </p>
      </Card>
    </div>
  );
}
