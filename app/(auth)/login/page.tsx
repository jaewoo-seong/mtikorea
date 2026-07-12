import { signIn } from "@/lib/auth";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";

const isDev = process.env.NODE_ENV !== "production";

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

        {isDev && (
          <>
            <div className="my-4 flex items-center gap-2 text-xs text-text-secondary">
              <div className="h-px flex-1 bg-border" />
              local dev only
              <div className="h-px flex-1 bg-border" />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("dev", { redirectTo: "/dashboard" });
              }}
            >
              <Button type="submit" variant="secondary" className="w-full">
                Continue as Dev User
              </Button>
            </form>
            <p className="mt-2 text-xs text-text-secondary">
              Skips Google OAuth for local testing — not available in production builds.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
