import "./entry.less";
import { allLocales, defaultLocale, type LocaleId } from "@keybr/intl";
import { Pages } from "@keybr/pages-shared";
import { main } from "./App.tsx";

redirectToPreferredLocale();
main();

function redirectToPreferredLocale(): void {
  if (typeof window === "undefined") {
    return;
  }
  const { pathname, search, hash } = window.location;
  if (localeFromPathname(pathname) != null) {
    return;
  }
  const preferred = preferredLocaleFromNavigator();
  if (preferred === defaultLocale) {
    return;
  }
  window.location.replace(Pages.intlPath(pathname, preferred) + search + hash);
}

function preferredLocaleFromNavigator(): LocaleId {
  if (typeof navigator === "undefined") {
    return defaultLocale;
  }
  const languages =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const language of languages) {
    const match = matchSupportedLocale(language);
    if (match != null) {
      return match;
    }
  }

  return defaultLocale;
}

function matchSupportedLocale(language: string): LocaleId | null {
  const raw = normalizeLocaleId(language);
  if (allLocales.includes(raw)) {
    return raw;
  }

  let intlLocale: Intl.Locale | null = null;
  try {
    intlLocale = new Intl.Locale(raw);
  } catch {
    intlLocale = null;
  }

  const lang = intlLocale?.language?.toLowerCase() ?? raw.split("-")[0] ?? "";
  const region = intlLocale?.region?.toLowerCase() ?? "";
  const script = intlLocale?.script?.toLowerCase() ?? "";

  if (lang === "zh") {
    // Prefer script if provided, then region hints.
    if (region === "tw" && allLocales.includes("zh-tw")) {
      return "zh-tw";
    }
    if (
      (script === "hant" || region === "hk" || region === "mo") &&
      allLocales.includes("zh-hant")
    ) {
      return "zh-hant";
    }
    return allLocales.includes("zh-hans") ? "zh-hans" : defaultLocale;
  }

  if (lang === "pt") {
    if (region === "br" && allLocales.includes("pt-br")) {
      return "pt-br";
    }
    if (region === "pt" && allLocales.includes("pt-pt")) {
      return "pt-pt";
    }
    return allLocales.includes("pt-pt") ? "pt-pt" : defaultLocale;
  }

  if (region) {
    const lr = `${lang}-${region}`;
    if (allLocales.includes(lr)) {
      return lr;
    }
  }
  return allLocales.includes(lang) ? lang : null;
}

function localeFromPathname(pathname: string): LocaleId | null {
  const m = /^\/([^/]+)(?:\/|$)/.exec(pathname);
  if (m == null) {
    return null;
  }
  const segment = decodeURIComponent(m[1]).toLowerCase();
  return allLocales.includes(segment) ? segment : null;
}

function normalizeLocaleId(id: string): string {
  return String(id).replaceAll("_", "-").toLowerCase();
}
