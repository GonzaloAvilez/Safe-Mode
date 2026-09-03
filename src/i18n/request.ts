import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;

  return {
    locale: isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE,
    messages: (await import(`../../messages/${isLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE}.json`))
      .default,
  };
});
