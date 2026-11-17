import Link from "next/link";
import { requireAdminSession } from "@/lib/admin-session";
import { countLettersAwaitingReview } from "@/lib/letter-review";
import { getSeedPhraseMailbox } from "@/lib/mailbox";
import {
  currentSettingsEnvironment,
  isContributeOpen,
  isLettersOpen,
  isSitePublic,
} from "@/lib/settings";
import {
  logoutAdmin,
  setContributeOpenAction,
  setLettersOpenAction,
  setSitePublicAction,
} from "./actions";

const NAV_LINKS = [
  { href: "/admin/phrases", label: "Phrases" },
  { href: "/admin/letters", label: "Letters" },
  { href: "/admin/mailbox", label: "Mailbox" },
  { href: "/admin/flagged", label: "Flagged / Crisis" },
  { href: "/admin/spend", label: "Spend" },
  { href: "/admin/metrics", label: "Metrics" },
];

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSession();
  const sitePublic = await isSitePublic();
  const contributeOpen = await isContributeOpen();
  const lettersOpen = await isLettersOpen();
  // Shown on the Letters link, so pending reviews are visible from any admin page
  // (ADR-004: no notifications, the founder reviews in batches).
  const lettersAwaitingReview = await countLettersAwaitingReview();
  // Same reason for the Mailbox link: seed-phrase correspondences waiting for the
  // founder's letter. Counted from the mailbox itself, so the number always matches the
  // page; the corpus of seed correspondences is small enough to load whole.
  const { correspondences } = await getSeedPhraseMailbox();
  const seedPhraseLettersToWrite = correspondences.filter(({ state }) => state === "your_turn").length;
  const pendingCounts: Record<string, number> = {
    "/admin/letters": lettersAwaitingReview,
    "/admin/mailbox": seedPhraseLettersToWrite,
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-6 py-4">
        <nav className="flex gap-5 text-sm text-white/70">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
              {(pendingCounts[link.href] ?? 0) > 0 && (
                <span className="ml-1 text-amber-300">({pendingCounts[link.href]})</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <span className={`text-xs ${sitePublic ? "text-green-400" : "text-red-400"}`}>
            [{currentSettingsEnvironment()}] Sitio {sitePublic ? "público" : "cerrado"}
          </span>
          <form action={setSitePublicAction}>
            <input type="hidden" name="value" value={(!sitePublic).toString()} />
            <button type="submit" className="text-sm text-white/40 hover:text-white/70">
              {sitePublic ? "Cerrar sitio" : "Abrir sitio"}
            </button>
          </form>
          <span className={`text-xs ${contributeOpen ? "text-green-400" : "text-red-400"}`}>
            Contribute {contributeOpen ? "abierto" : "cerrado"}
          </span>
          <form action={setContributeOpenAction}>
            <input type="hidden" name="value" value={(!contributeOpen).toString()} />
            <button type="submit" className="text-sm text-white/40 hover:text-white/70">
              {contributeOpen ? "Cerrar contribute" : "Abrir contribute"}
            </button>
          </form>
          <span className={`text-xs ${lettersOpen ? "text-green-400" : "text-red-400"}`}>
            Cartas {lettersOpen ? "abiertas" : "cerradas"}
          </span>
          <form action={setLettersOpenAction}>
            <input type="hidden" name="value" value={(!lettersOpen).toString()} />
            <button type="submit" className="text-sm text-white/40 hover:text-white/70">
              {lettersOpen ? "Cerrar cartas" : "Abrir cartas"}
            </button>
          </form>
          <form action={logoutAdmin}>
            <button type="submit" className="text-sm text-white/40 hover:text-white/70">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
