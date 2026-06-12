import { redirect } from "next/navigation"
import { auth } from "@/auth"

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  return session
}

export async function requireRole(role: string) {
  const session = await requireAuth()
  if (session.user.role !== role) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/seller")
  }
  return session
}
