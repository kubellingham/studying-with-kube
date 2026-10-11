"use client";

import { useState, type FormEvent } from "react";
import { Brand, Button } from "./ui";

export default function UnlockForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Couldn't check the password. Try again.");
      }
      // The gate answered at the URL that was asked for, so reloading it now shows the real page.
      if (window.location.pathname === "/unlock") window.location.replace("/");
      else window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Brand />
      <form onSubmit={submit} className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <label htmlFor="password" className="text-sm font-medium">
          Access password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent"
        />
        {error && (
          <p className="mt-3 text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="mt-4 w-full" disabled={busy || !password.trim()}>
          {busy ? "Checking…" : "Continue"}
        </Button>
        <p className="mt-4 text-xs text-muted">This is a private test build. Ask Prince for the password.</p>
      </form>
    </main>
  );
}
