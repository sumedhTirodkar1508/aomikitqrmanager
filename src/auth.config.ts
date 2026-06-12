import type { NextAuthConfig } from "next-auth"

// Edge-compatible config — no Node.js imports (no pg, no bcrypt).
// Used in middleware and spread into the full auth.ts config.
export const authConfig = {
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? ""
        token.role = (user as { role?: string }).role ?? ""
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      return session
    },
  },
  session: { strategy: "jwt" as const },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig
