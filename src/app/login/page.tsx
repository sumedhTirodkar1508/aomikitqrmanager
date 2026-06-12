import { auth } from "@/auth"
import { redirect } from "next/navigation"
import LoginForm from "@/components/auth/login-form"

export const metadata = { title: "Sign in — AOMI Kit QR Manager" }

export default async function LoginPage() {
  const session = await auth()

  if (session?.user) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/seller")
  }

  return <LoginForm />
}
