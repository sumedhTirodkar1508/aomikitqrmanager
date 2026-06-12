import { auth } from "@/auth"
import { redirect } from "next/navigation"

// Middleware handles the `/` redirect at the edge.
// This server component is a fallback in case middleware is bypassed.
export default async function Home() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  redirect(session.user.role === "ADMIN" ? "/admin" : "/seller")
}
