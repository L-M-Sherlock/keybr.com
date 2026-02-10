import {
  allLocales,
  defaultLocale,
  useIntlDisplayNames,
  usePreferredLocale,
} from "@keybr/intl";
import { Pages } from "@keybr/pages-shared";
import { Link as StaticLink } from "@keybr/widget";
import { useIntl } from "react-intl";
import { Link as RouterLink } from "react-router";
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
  const { formatLanguageName, formatLocalLanguageName } = useIntlDisplayNames();
  const preferredLocale = usePreferredLocale();
  const primary = [];
  primary.push(
    <StaticLink
      className={styles.localeLink}
      href={Pages.intlPath(currentPath, preferredLocale)}
    >
      {formatLocalLanguageName(preferredLocale)}
    </StaticLink>,
  );
  if (preferredLocale !== defaultLocale) {
    primary.push(
      <StaticLink
        className={styles.localeLink}
        href={Pages.intlPath(currentPath, defaultLocale)}
      >
        {formatLocalLanguageName(defaultLocale)}
      </StaticLink>,
    );
  }
  const secondary = [];
  for (const locale of allLocales) {
    if (locale !== preferredLocale && locale !== defaultLocale) {
      if (secondary.length > 0) {
        secondary.push(" ");
      }
      secondary.push(
        <StaticLink
          className={styles.localeLink}
          href={Pages.intlPath(currentPath, locale)}
          title={`${formatLocalLanguageName(locale)} / ${formatLanguageName(locale)}`}
        >
          {locale}
        </StaticLink>,
      );
    }
  }
  return (
    <>
      {...primary}
      <span className={styles.localeList}>{...secondary}</span>
    </>
  );
}
