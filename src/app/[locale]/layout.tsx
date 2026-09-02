import { notFound } from "next/navigation";
import { isLocale, SUPPORTED_LOCALES } from "@/lib/locale";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return children;
}
