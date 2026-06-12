import { requireRole } from "@/lib/auth-helpers"

export const metadata = { title: "Admin Dashboard — AOMI Kit QR Manager" }

export default async function AdminPage() {
  const session = await requireRole("ADMIN")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Welcome back, {session.user.name ?? session.user.email}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">
          Session
        </h2>
        <dl className="space-y-3">
          <div className="flex gap-4">
            <dt className="w-24 text-sm font-medium text-zinc-600 dark:text-zinc-400">Name</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{session.user.name}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 text-sm font-medium text-zinc-600 dark:text-zinc-400">Email</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{session.user.email}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 text-sm font-medium text-zinc-600 dark:text-zinc-400">Role</dt>
            <dd className="text-sm">
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                {session.user.role}
              </span>
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 text-sm font-medium text-zinc-600 dark:text-zinc-400">ID</dt>
            <dd className="text-sm font-mono text-zinc-500 dark:text-zinc-400">{session.user.id}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
