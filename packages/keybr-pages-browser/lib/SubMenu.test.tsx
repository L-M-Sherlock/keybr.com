import { test } from "node:test";
import {
  defaultLocale,
  FakeIntlProvider,
  PreferredLocaleContext,
} from "@keybr/intl";
import { PageDataContext } from "@keybr/pages-shared";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { equal, isNotNull } from "rich-assert";
import { SubMenu } from "./SubMenu.tsx";

test("render", () => {
  const r = render(
    <PageDataContext.Provider
      value={{
        base: "https://www.keybr.com/",
        locale: "en",
        user: null,
        publicUser: {
          id: "userId",
          name: "userName",
          imageUrl: "imageUrl",
          premium: false,
        },
        settings: null,
      }}
    >
      <PreferredLocaleContext.Provider value="pl">
        <FakeIntlProvider>
          <MemoryRouter>
            <SubMenu currentPath="/page" />
          </MemoryRouter>
        </FakeIntlProvider>
      </PreferredLocaleContext.Provider>
    </PageDataContext.Provider>,
  );

  isNotNull(r.queryByText("Polski"));
  const english = r.queryByText("English");
  isNotNull(english);
  const link = english.closest("a");
  isNotNull(link);
  equal(link.getAttribute("href"), "/en/page");

  r.unmount();
});

test("default locale link includes locale prefix", () => {
  const r = render(
    <PageDataContext.Provider
      value={{
        base: "https://www.keybr.com/",
        locale: defaultLocale,
        user: null,
        publicUser: {
          id: "userId",
          name: "userName",
          imageUrl: "imageUrl",
          premium: false,
        },
        settings: null,
      }}
    >
      <PreferredLocaleContext.Provider value={defaultLocale}>
        <FakeIntlProvider>
          <MemoryRouter>
            <SubMenu currentPath="/" />
          </MemoryRouter>
        </FakeIntlProvider>
      </PreferredLocaleContext.Provider>
    </PageDataContext.Provider>,
  );

  const english = r.queryByText("English");
  isNotNull(english);
  const link = english.closest("a");
  isNotNull(link);
  equal(link.getAttribute("href"), "/en");

  r.unmount();
});
