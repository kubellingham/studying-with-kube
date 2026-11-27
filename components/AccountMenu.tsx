"use client";

import { useMe } from "@/lib/useMe";

/** Who's signed in, and Sign out. Renders nothing when sign-in is off (local dev). */
export default function AccountMenu() {
  const me = useMe();
  if (!me?.accounts) return null;
  const paid = me.usage?.middle.plan === "paid";
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-2">
      {paid && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Paid</span>}
      <span className="hidden max-w-48 truncate text-xs text-muted md:inline" title={me.email ?? undefined}>
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
