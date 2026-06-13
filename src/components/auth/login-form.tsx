"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AlertCircle, ArrowRight, QrCode, ShieldCheck, Sparkles } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

export default function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const result = await signIn("credentials", {
      email: form.get("email") as string,
      password: form.get("password") as string,
      redirect: false,
    })

    if (result?.error) {
      setError("Invalid email or password.")
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,color-mix(in_oklch,var(--primary)_5%,transparent),transparent_26rem)]" />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-lg md:grid-cols-[1fr_0.9fr]">
        <section className="hidden min-h-[34rem] flex-col justify-between bg-sidebar p-8 text-sidebar-foreground md:flex">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
              <QrCode className="size-5" />
            </span>
            <div>
              <p className="font-semibold">AOMI Kit</p>
              <p className="text-xs text-sidebar-foreground/50">QR Manager</p>
            </div>
          </div>
          <div className="max-w-sm space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-medium">
              <Sparkles className="size-3.5 text-chart-2" />
              Skincare operations, organized
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">
              Manage every AOMI Kit from product setup to seller assignment.
            </h1>
            <p className="text-sm leading-6 text-sidebar-foreground/60">
              A focused workspace for QR lifecycles, treatment routines, and product administration.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/45">
            <ShieldCheck className="size-4" />
            Authorized team access only
          </div>
        </section>

        <Card className="w-full rounded-none bg-card py-8 shadow-none ring-0 sm:px-6 md:px-8">
          <CardHeader>
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground md:hidden">
              <QrCode className="size-5" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
            <CardDescription>Sign in to continue to AOMI Kit QR Manager.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <div role="alert" aria-live="polite" className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  {error}
                </div>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? <Spinner /> : <ArrowRight data-icon="inline-end" />}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
