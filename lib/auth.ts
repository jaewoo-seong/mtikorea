import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { query } from "@/lib/db";

const DEFAULT_ORG_NAME = "MTI Technology";
const DEFAULT_ORG_SLUG = "mti";
const isDev = process.env.NODE_ENV !== "production";

// Single-tenant for now — no multi-org onboarding UI exists, so every user
// lands in the same default org. INSERT ... ON CONFLICT DO UPDATE (a no-op
// update) is used instead of DO NOTHING so RETURNING still gives back the
// existing row on repeat calls.
async function ensureDefaultOrg() {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id`,
    [DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG],
  );
  return rows[0].id;
}

// Dev-only sign-in that skips the Google OAuth round-trip so the app can be
// tested locally before Google Cloud billing / OAuth credentials are set up.
// Registered only when NODE_ENV !== "production" — cannot exist in a
// production build, so it can't accidentally ship as a real auth bypass.
const devCredentialsProvider = Credentials({
  id: "dev",
  name: "Dev User",
  credentials: {},
  async authorize() {
    return { id: "dev-user", email: "dev@mti.local", name: "Dev User" };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: isDev ? [Google, devCredentialsProvider] : [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user?.email) {
        const orgId = await ensureDefaultOrg();
        // First sign-in: upsert the user row and stamp role/org onto the token.
        // New users become 'admin' if the org has no admin yet (bootstrap —
        // otherwise the admin panel would be permanently unreachable), else
        // 'member'. Existing users' role is left untouched on conflict.
        const { rows } = await query<{ id: string; role: string; org_id: string }>(
          `INSERT INTO users (email, name, oauth_provider, org_id, role)
           VALUES (
             $1, $2, $3, $4,
             CASE WHEN EXISTS (SELECT 1 FROM users WHERE org_id = $4 AND role = 'admin')
               THEN 'member' ELSE 'admin' END
           )
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             org_id = COALESCE(users.org_id, EXCLUDED.org_id),
             updated_at = now()
           RETURNING id, role, org_id`,
          [user.email, user.name ?? null, account?.provider ?? "google", orgId],
        );
        token.userId = rows[0].id;
        token.role = rows[0].role;
        token.orgId = rows[0].org_id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.orgId = token.orgId as string;
      }
      return session;
    },
  },
});
