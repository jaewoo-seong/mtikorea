import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { query } from "@/lib/db";

const DEFAULT_ORG_NAME = "MTI Technology";
const DEFAULT_ORG_SLUG = "mti";
// Requires BOTH conditions, not just NODE_ENV !== "production" — `next start`
// only defaults NODE_ENV to "production" when it's unset; an explicit
// non-production value (e.g. NODE_ENV=staging on a reachable Railway
// environment, inherited from a shared variable group) would leave the old
// single-condition check registering an unauthenticated login bypass on a
// public deployment. ALLOW_DEV_LOGIN must be deliberately set too, and should
// never be set anywhere but true local dev.
const isDev = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true";

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

// The JWT session strategy stamps `role` onto the token only at sign-in —
// it does NOT get updated on every request. A user demoted from admin keeps
// a session that still says role: 'admin' until they sign out/in again or
// the session expires. Admin-gated routes should call this instead of
// trusting `session.user.role` directly.
export async function isCurrentAdmin(userId: string): Promise<boolean> {
  const { rows } = await query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [userId]);
  return rows[0]?.role === "admin";
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
  // Railway (like most non-Vercel hosts) terminates TLS at its edge and
  // forwards over HTTP with X-Forwarded-* headers. Without trustHost, Auth.js
  // refuses to trust that forwarded host/proto, which on the proxy.ts
  // middleware path manifests as an infinite redirect loop rather than a
  // clean error — every request re-derives an inconsistent origin and
  // re-redirects. Safe to trust here since Railway's edge is the only way in.
  trustHost: true,
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
