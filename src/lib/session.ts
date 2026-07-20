import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** Use in server components/pages that must be authenticated. Redirects otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin");
  }
  return user;
}

/** Use in route handlers. Returns null instead of redirecting. */
export async function requireUserApi() {
  const user = await getCurrentUser();
  return user;
}
