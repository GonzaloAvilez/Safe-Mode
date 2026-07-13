import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { logoutAdmin } from "./actions";

const NAV_LINKS = [
  { href: "/admin/phrases", label: "Phrases" },
  { href: "/admin/flagged", label: "Flagged / Crisis" },
  { href: "/admin/spend", label: "Spend" },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <nav className="flex gap-5 text-sm text-white/70">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-white/40 hover:text-white/70">
            Salir
          </button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
