import {
  allLocales,
  defaultLocale,
  useIntlDisplayNames,
  usePreferredLocale,
} from "@keybr/intl";
import { Pages } from "@keybr/pages-shared";
import { Link as StaticLink, OptionList } from "@keybr/widget";
import { useIntl } from "react-intl";
import * as styles from "./SubMenu.module.less";

export function SubMenu({ currentPath }: { readonly currentPath: string }) {
  const { formatMessage } = useIntl();
  return (
    <div className={styles.root}>
      <GithubLink />
      <KeybrLink />
      <LocaleSwitcher currentPath={currentPath} />
    </div>
  );
}

function GithubLink() {
  const { formatMessage } = useIntl();
  return (
    <StaticLink
      href="https://github.com/L-M-Sherlock/kanabr"
      target="github"
      title={formatMessage({
        id: "footer.githubLink.description",
        defaultMessage: "The source code of kanabr is available on GitHub.",
      })}
    >
      Github
    </StaticLink>
  );
}

function KeybrLink() {
  const { formatMessage } = useIntl();
  return (
    <StaticLink
      href="https://www.keybr.com/"
      target="keybr"
      title={formatMessage({
        id: "footer.keybrLink.description",
        defaultMessage:
          "For other languages and keyboard layouts, use keybr.com.",
      })}
    >
      keybr.com
    </StaticLink>
  );
}

function LocaleSwitcher({ currentPath }: { readonly currentPath: string }) {
  const { formatLocalLanguageName } = useIntlDisplayNames();
  const preferredLocale = usePreferredLocale();
  const options = allLocales.map((locale) => ({
    value: locale,
    name: formatLocalLanguageName(locale),
  }));

  const handleSelect = (value: string) => {
    const next = intlPathIncludingDefaultLocale(currentPath, value);
    if (typeof window === "undefined") {
      return;
    }
    const { search, hash } = window.location;
    window.location.assign(`${next}${search}${hash}`);
  };

  return (
    <OptionList
      className={styles.localeSelect}
      options={options}
      value={preferredLocale}
      size="full"
      onSelect={handleSelect}
    />
  );
}

function intlPathIncludingDefaultLocale(path: string, locale: string): string {
  return locale === defaultLocale
    ? path === "/"
      ? `/${locale}`
      : `/${locale}${path}`
    : Pages.intlPath(path, locale);
}
