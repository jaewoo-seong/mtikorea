import { signIn } from "@/lib/auth";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";

export default function LoginPage() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background">
      <Card variant="elevated" className="w-full max-w-sm text-center">
        <h1 className="mb-1 text-xl font-bold text-text">MTI AI Platform</h1>
        <p className="mb-6 text-sm text-text-secondary">
          Sign in to access the dashboard, email, and company database.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" variant="primary" className="w-full">
            Continue with Google
          </Button>
        </form>
      </Card>
    </div>
  );
}
