import { Card } from "@/components/common/Card";

export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold text-text">Dashboard</h1>
      <Card variant="outline">
        <p className="text-sm text-text-secondary">
          Foundation phase placeholder — task queue, work log, and progress tracking land in the
          dashboard build phase.
        </p>
      </Card>
    </div>
  );
}
