import { cache } from "react"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: string
}

// Memoized per-request: React cache() deduplicates within one render/action context.
// The underlying DB lookup runs at most once per server request regardless of how
// many layouts, pages, or actions call requireAuth / requireRole.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })

  // Reject deleted users and users deactivated after their JWT was issued.
  if (!dbUser || !dbUser.isActive) return null

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
  }
})
