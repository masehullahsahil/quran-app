/**
 * @vitest-environment happy-dom
 *
 * The sign-in entry point in the desk header, driven the way a learner drives it.
 *
 * The login flow existed for months with no way to reach it: the only Sign in
 * button in the codebase lived in DashboardLayout, which no page renders, and
 * the Home page itself carried no auth UI at all — a signed-out visitor could
 * browse forever and never be offered a way in. These tests pin the entry
 * point that closes that gap: it renders when signed out, it starts the login
 * only on a click (never on render, which would desync the OAuth state
 * cookie), it shows who is signed in with a way out, and while the session is
 * still being checked it shows neither state.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import { loadLocale } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";

const startLoginMock = vi.hoisted(() => vi.fn());
vi.mock("@/const", () => ({
  startLogin: startLoginMock,
}));

const trpcMocks = vi.hoisted(() => ({
  logoutMutateAsync: vi.fn(async () => ({ success: true as const })),
  setData: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  logoutPending: false,
  logoutShouldReject: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      auth: { me: { setData: trpcMocks.setData, invalidate: trpcMocks.invalidate } },
    }),
    auth: {
      logout: {
        useMutation: () => ({
          mutateAsync: async () => {
            if (trpcMocks.logoutShouldReject) throw new Error("network unreachable");
            return trpcMocks.logoutMutateAsync();
          },
          isPending: trpcMocks.logoutPending,
          reset: vi.fn(),
        }),
      },
    },
  },
}));

import { AuthEntry, type AuthEntryUser } from "./AuthEntry";
import { LocaleProvider } from "@/contexts/LocaleContext";

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  // See LanguagePicker.test.tsx: warm the dynamic pack imports first.
  for (const code of SUPPORTED_LANGUAGE_CODES) await loadLocale(code);
});

async function settle() {
  for (let turn = 0; turn < 2; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function mount(user: AuthEntryUser, isLoading: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <AuthEntry user={user} isLoading={isLoading} />
      </LocaleProvider>,
    );
  });
  await settle();
}

const signInButton = () => container.querySelector<HTMLButtonElement>(".auth-signin");
const signOutButton = () => container.querySelector<HTMLButtonElement>(".auth-signout");

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  startLoginMock.mockClear();
  trpcMocks.logoutMutateAsync.mockClear();
  trpcMocks.setData.mockClear();
  trpcMocks.invalidate.mockClear();
  trpcMocks.logoutPending = false;
  trpcMocks.logoutShouldReject = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("signed out", () => {
  it("shows a labelled Sign in button, not just an icon", async () => {
    await mount(null, false);

    const button = signInButton();
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain(en.strings["auth.signIn"]);
    expect(button!.getAttribute("aria-label")).toBe(en.strings["auth.signIn"]);
    expect(signOutButton()).toBeNull();
  });

  it("does not start the login on render", async () => {
    await mount(null, false);

    expect(startLoginMock).not.toHaveBeenCalled();
  });

  it("starts the login exactly once per click", async () => {
    await mount(null, false);

    await act(async () => {
      signInButton()!.click();
    });

    expect(startLoginMock).toHaveBeenCalledTimes(1);
  });

  it("labels the button in the learner's language", async () => {
    window.localStorage.setItem("miqra-locale", "ps");
    await mount(null, false);

    expect(signInButton()!.textContent).toContain(ps.strings["auth.signIn"]);
    expect(signInButton()!.textContent).not.toContain(en.strings["auth.signIn"]);
  });
});

describe("signed in", () => {
  const user: AuthEntryUser = { name: "Sahil", email: "masehullah.sahil1@gmail.com" };

  it("shows the learner's name and initial, with a way out", async () => {
    await mount(user, false);

    expect(signInButton()).toBeNull();
    expect(container.querySelector(".auth-identity")?.textContent).toContain("Sahil");
    expect(container.querySelector(".auth-avatar")?.textContent).toBe("S");
    expect(signOutButton()!.textContent).toContain(en.strings["auth.signOut"]);
  });

  it("falls back to the email address when the account has no name", async () => {
    await mount({ name: null, email: "learner@example.com" }, false);

    expect(container.querySelector(".auth-identity")?.textContent).toContain("learner@example.com");
    expect(container.querySelector(".auth-avatar")?.textContent).toBe("L");
  });

  it("signs out: clears the server session, the mirrored token, and the cached identity", async () => {
    window.sessionStorage.setItem("manus-cookie", "session=abc");
    await mount(user, false);

    await act(async () => {
      signOutButton()!.click();
    });
    await settle();

    expect(trpcMocks.logoutMutateAsync).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("manus-cookie")).toBeNull();
    expect(trpcMocks.setData).toHaveBeenCalledWith(undefined, null);
    expect(trpcMocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("still clears local session state when the logout call itself fails", async () => {
    trpcMocks.logoutShouldReject = true;
    window.sessionStorage.setItem("manus-cookie", "session=abc");
    await mount(user, false);

    await act(async () => {
      signOutButton()!.click();
    });
    await settle();

    // The invalidate re-fetches auth.me, which restores the signed-in state
    // if the session is in fact still alive server-side.
    expect(window.sessionStorage.getItem("manus-cookie")).toBeNull();
    expect(trpcMocks.setData).toHaveBeenCalledWith(undefined, null);
    expect(trpcMocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("disables Sign out while a logout is in flight", async () => {
    trpcMocks.logoutPending = true;
    await mount(user, false);

    expect(signOutButton()!.disabled).toBe(true);
  });
});

describe("while the session is being checked", () => {
  it("renders neither the signed-out nor the signed-in state", async () => {
    await mount(null, true);

    expect(container.querySelector(".auth-entry")).toBeNull();
    expect(container.textContent).not.toContain(en.strings["auth.signIn"]);
    expect(container.textContent).not.toContain(en.strings["auth.signOut"]);
    expect(startLoginMock).not.toHaveBeenCalled();
  });
});
