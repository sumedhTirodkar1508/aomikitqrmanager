import { redirect } from "next/navigation"
import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user"

// Shape returned by all requireX helpers — callers access session.user.X.
export type AuthUser = { user: CurrentUser }

function defaultRedirect(role: string): never {
  redirect(role === "ADMIN" ? "/admin" : "/seller")
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return { user }
}

export async function requireRole(role: string): Promise<AuthUser> {
  const { user } = await requireAuth()
  if (user.role !== role) defaultRedirect(user.role)
  return { user }
}

// Allow any of the listed roles; rejects unauthenticated and unlisted roles.
export async function requireAnyRole(...roles: string[]): Promise<AuthUser> {
  const { user } = await requireAuth()
  if (!roles.includes(user.role)) defaultRedirect(user.role)
  return { user }
}
