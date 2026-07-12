import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { query } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        // First sign-in: upsert the user row and stamp the role onto the token.
        const { rows } = await query<{ id: string; role: string }>(
          `INSERT INTO users (email, name, oauth_provider)
           VALUES ($1, $2, 'google')
           ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
           RETURNING id, role`,
          [user.email, user.name ?? null],
        );
        token.userId = rows[0].id;
        token.role = rows[0].role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
