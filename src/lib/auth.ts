import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/security/rateLimit";
import { isDemoEmail } from "@/lib/demo";

// bcrypt hash of a random, discarded value. Compared against when the email is unknown so a
// missing account takes as long as a wrong password (no timing signal for account enumeration).
const DUMMY_PASSWORD_HASH = "$2b$12$6XuJsihAB/3E5pPcqHWlHOeVQr9zCCJkxqlNiOZeu.4dXwN7.zQzC";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Throttle password guessing: per IP always, and per account except for
        // the shared demo account (many visitors legitimately share it).
        const ip = request ? getClientIp(request.headers) : "unknown";
        const ipLimit = await rateLimit(`login-ip:${ip}`, { limit: 20, windowMs: 15 * 60_000 });
        if (!ipLimit.allowed) return null;
        if (!isDemoEmail(normalizedEmail)) {
          const acctLimit = await rateLimit(`login:${normalizedEmail}`, { limit: 10, windowMs: 15 * 60_000 });
          if (!acctLimit.allowed) return null;
        }

        const user = await db.user.findUnique({
          where: { email: normalizedEmail },
        });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        if (!user || !valid) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
