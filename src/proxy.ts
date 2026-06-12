import { auth } from "@/auth"
import { NextResponse } from "next/server"

// Coarse route protection at the proxy layer (Node.js runtime in Next.js 16).
// Fine-grained auth checks are repeated in server components via requireAuth/requireRole.
export default auth((req) => {
  const session = req.auth
  const { pathname } = req.nextUrl
  const isLoggedIn = !!session?.user
  const role = session?.user?.role

  if (pathname === "/") {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return NextResponse.redirect(
      new URL(role === "ADMIN" ? "/admin" : "/seller", req.url)
    )
  }

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    if (role !== "ADMIN") {
      return NextResponse.redirect(new URL("/seller", req.url))
    }
  }

  if (pathname.startsWith("/seller")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
  }
})

export const config = {
  matcher: ["/", "/admin/:path*", "/seller/:path*"],
}
