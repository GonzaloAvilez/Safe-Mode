"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";

const OPTIONS: Array<{ locale: Locale; shortLabel: string; messageKey: "english" | "spanish" }> = [
  { locale: "en", shortLabel: "EN", messageKey: "english" },
  { locale: "es", shortLabel: "ES", messageKey: "spanish" },
];

export function replaceLocaleInPathname(pathname: string, locale: Locale): string {
  const segments = pathname.split("/");
  segments[1] = locale;
  return segments.join("/") || `/${locale}`;
}

export function LanguageSelector() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("languageSelector");

  function switchLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;

    const nextPathname = replaceLocaleInPathname(pathname, nextLocale);
    router.replace(`${nextPathname}${window.location.search}`);
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="fixed top-9 right-12 z-[60] flex items-center gap-1 rounded-full border border-white/10 bg-black/15 p-1 text-[11px] tracking-[0.12em] backdrop-blur-sm"
    >
      {OPTIONS.map((option) => {
        const selected = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            aria-label={t(option.messageKey)}
            aria-pressed={selected}
            onClick={() => switchLocale(option.locale)}
            className={`rounded-full px-2.5 py-1.5 transition-colors duration-300 ${
              selected
                ? "bg-white/10 text-white/85"
                : "text-white/35 hover:bg-white/[0.06] hover:text-white/65"
            }`}
          >
            {option.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
