/**
 * The sign-in entry point in the reading desk's header.
 *
 * The login flow existed for months with no way to reach it: the only Sign in
 * button in the codebase lived in DashboardLayout, which no page renders, and
 * the Home page carried no auth UI at all. A signed-out visitor could browse
 * forever and never be offered a way in, and the Google login could never be
 * tested end to end. This is that way in — one labelled button, in the header
 * beside the language control.
 *
 * Login stays optional. Nothing here gates or blocks any screen: browsing,
 * reading and reciting work exactly as before without signing in. Signing in
 * only saves Qaida and memorization progress to the learner's account, so it
 * follows them across devices instead of living in one browser.
 *
 * Home already fetches `auth.me`; this reuses that result through props rather
 * than issuing a second auth query. The logout follows the pattern in
 * `_core/hooks/useAuth.ts`: the mutation clears the server cookie, and the
 * finally block clears the mirrored Preview token and the cached identity.
 *
 * `startLogin` is called only from the click handler, never during render:
 * it mints a one-time nonce and writes the state cookie, so a render-phase
 * call would desync it from an in-flight login's `state` (see const.ts).
 */
// See LanguagePicker.tsx: the default React import is what lets this render
// in a test under the classic JSX transform.
import React from "react";
import { LogIn, LogOut } from "lucide-react";
import { startLogin } from "@/const";
import { useLocale } from "@/contexts/LocaleContext";
import { trpc } from "@/lib/trpc";

/** The identity `auth.me` returns, reduced to what the header displays. */
export type AuthEntryUser = {
  name: string | null;
  email: string | null;
} | null | undefined;

export function AuthEntry({ user, isLoading }: { user: AuthEntryUser; isLoading: boolean }) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();

  const signOut = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // A failed logout still clears local state below. The invalidate
      // re-fetches auth.me, which restores the signed-in state if the session
      // is in fact still alive server-side — so a network hiccup cannot leave
      // the header claiming a session the server has dropped, or vice versa.
    } finally {
      // Clear the Preview auto-login token mirrored into sessionStorage, so
      // header-based sessions (Safari ITP / WebView) are logged out too. The
      // backend cookie is cleared by the logout mutation.
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  };

  if (isLoading) {
    // No flash of the wrong state: a signed-in learner must never see
    // "Sign in" for the second auth.me takes to answer, and a signed-out
    // visitor must never see a name that is about to vanish.
    return null;
  }

  if (!user) {
    return (
      <button
        type="button"
        className="auth-entry auth-signin"
        aria-label={t("auth.signIn")}
        onClick={() => startLogin()}
      >
        <LogIn size={15} aria-hidden="true" />
        <span>{t("auth.signIn")}</span>
      </button>
    );
  }

  const displayName = user.name?.trim() || user.email?.trim() || "";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <span className="auth-entry auth-identity">
      <span className="auth-avatar" aria-hidden="true">{initial}</span>
      {displayName && <span className="auth-name">{displayName}</span>}
      <button
        type="button"
        className="auth-signout"
        aria-label={t("auth.signOut")}
        disabled={logoutMutation.isPending}
        onClick={() => void signOut()}
      >
        <LogOut size={15} aria-hidden="true" />
        <span>{t("auth.signOut")}</span>
      </button>
    </span>
  );
}
