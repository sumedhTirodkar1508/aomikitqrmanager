import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  Boxes,
  ClipboardList,
  QrCode,
  Shapes,
  UserRound,
} from "lucide-react";

export const metadata = { title: "Admin Dashboard — AOMI Kit QR Manager" };

export default async function AdminPage() {
  const session = await requireRole("ADMIN");

  const [
    productCount,
    diagnosisCount,
    routineTypeCount,
    routineCount,
    tokenCount,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.diagnosis.count(),
    prisma.routineType.count(),
    prisma.routineTemplate.count(),
    prisma.qRToken.count(),
  ]);

  const cards = [
    {
      href: "/admin/products",
      label: "Products",
      detail: "Catalog and replacement rules",
      icon: Boxes,
      count: productCount,
      unit: "items",
    },
    {
      href: "/admin/diagnoses",
      label: "Diagnoses",
      detail: "Skin diagnosis profiles",
      icon: Activity,
      count: diagnosisCount,
      unit: "profiles",
    },
    {
      href: "/admin/routine-types",
      label: "Routine types",
      detail: "Routine classifications",
      icon: Shapes,
      count: routineTypeCount,
      unit: "types",
    },
    {
      href: "/admin/routines",
      label: "Routines",
      detail: "Treatment templates and steps",
      icon: ClipboardList,
      count: routineCount,
      unit: "templates",
    },
    {
      href: "/admin/qr-tokens",
      label: "QR tokens",
      detail: "Generate, import, and monitor",
      icon: QrCode,
      count: tokenCount,
      unit: "tokens",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${session.user.name ?? session.user.email}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group outline-none"
            >
              {/* Added a border transition on hover to tie together the card feel */}
              <Card className="h-full transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-md group-hover:border-primary/20 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                {/* Normalized padding to p-5 for balanced visual weight */}
                <CardHeader className="flex flex-row items-center justify-between py-2 px-5 space-y-0 h-full gap-4">
                  {/* Left Column: Icon, Title, Description */}
                  <div className="flex flex-col gap-3 flex-1 min-w-0">
                    <span className="icon-tile flex items-center justify-center size-10 aspect-square rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div className="space-y-1">
                      <CardTitle className="text-base truncate tracking-tight">
                        {item.label}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-xs leading-relaxed">
                        {item.detail}
                      </CardDescription>
                    </div>
                  </div>

                  {/* Right Column: Self-stretching Separator + Centered Numbers */}
                  {/* self-stretch dynamically maps the line to match the text column height */}
                  <div className="self-stretch flex flex-col items-center justify-center shrink-0 border-l border-border/60 pl-5 min-w-[85px]">
                    <span className="text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground transition-colors group-hover:text-primary">
                      {item.count.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase mt-2">
                      {item.unit}
                    </span>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="icon-tile flex items-center justify-center size-10 aspect-square rounded-lg">
              <UserRound className="size-5" />
            </span>
            <div>
              <CardTitle>Current session</CardTitle>
              <CardDescription>
                Your authenticated admin identity.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="mt-1 font-medium">
                {session.user.name ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-1 font-medium">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="mt-1">
                <Badge>{session.user.role}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="mt-1 truncate font-mono text-xs">
                {session.user.id}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
