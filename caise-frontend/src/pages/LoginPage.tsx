import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Logo } from "../components/layout/Logo";
import { GithubIcon } from "../components/ui/GithubIcon";
import { Button } from "../components/ui/Button";
import { ErrorNotice, FullScreenSpinner, Spinner } from "../components/ui/Feedback";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";

export function LoginPage() {
  const { user, loading, signInAsGuest } = useAuth();
  const navigate = useNavigate();
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  const continueAsGuest = async () => {
    setGuestBusy(true);
    setGuestError(null);
    try {
      await signInAsGuest();
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setGuestError(errorMessage(e));
      setGuestBusy(false);
    }
  };

  if (loading) return <FullScreenSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,#f5f5f4,#fafaf9_60%)] px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-10 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-8 text-lg font-medium tracking-tight">Understand your codebase, securely.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ask questions, trace logic and review changes across your repositories with AI that only sees what you can.
          </p>
        </div>

        {/* A full navigation, not fetch: GitHub's OAuth flow redirects the browser and sets the session cookie. */}
        <a
          href={api.loginUrl()}
          className="mt-8 flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-ink text-sm font-medium text-white transition-all hover:bg-stone-700 hover:shadow-md active:scale-[0.99]"
        >
          <GithubIcon className="size-5" />
          Sign in with GitHub
        </a>

        <Button variant="secondary" className="mt-3 h-11 w-full" onClick={() => void continueAsGuest()} disabled={guestBusy}>
          {guestBusy && <Spinner />} Continue without signing in
        </Button>
        <p className="mt-2 text-center text-xs text-faint">Public GitHub repositories only</p>
        {guestError && <ErrorNotice className="mt-3">{guestError}</ErrorNotice>}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint">
          <ShieldCheck className="size-3.5" />
          Read-only access. Sessions use secure HttpOnly cookies.
        </p>
      </div>
    </div>
  );
}
