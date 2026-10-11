"use client";

import { Brand, Button } from "@/components/ui";

export default function SharedSetError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Brand />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Couldn&apos;t load this set</h1>
      <p className="mt-2 text-muted">Storage didn&apos;t answer. This is usually temporary.</p>
      <Button variant="primary" className="mt-6 self-start" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
