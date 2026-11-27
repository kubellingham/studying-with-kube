"use client";

import { useEffect, useState } from "react";

interface Me {
  accounts: boolean;
  email?: string | null;
  name?: string | null;
}

/** Who's signed in, and Sign out. Renders nothing when sign-in is off (local dev). */
export default function AccountMenu() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Me | null) => live && setMe(data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!me?.accounts) return null;
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-2">
      <span className="hidden max-w-48 truncate text-xs text-muted sm:inline" title={me.email ?? undefined}>
        {me.email}
      </span>
      <button
        type="submit"
        className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}
