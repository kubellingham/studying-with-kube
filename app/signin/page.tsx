import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInButton from "@/components/SignInButton";
import { Brand } from "@/components/ui";
import { safeNext } from "@/lib/safeNext";
import { supabaseForRequest } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in · StudyingKube" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const supabase = await supabaseForRequest();
  if (!supabase) redirect(next);
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <Brand />
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold tracking-tight">Sign in to StudyingKube</h1>
        <p className="mt-2 text-sm text-muted">
          Turn a unit of lecture slides into flashcards, a quiz and a cram summary. Free: 5 sets a day.
        </p>
        {params.error && (
          <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
            Sign-in didn&apos;t complete. Try again.
          </p>
        )}
        <SignInButton next={next} />
        <p className="mt-4 text-xs text-muted">
          We keep your name, email and how many sets you&apos;ve made. Never your slides.
        </p>
      </div>
    </main>
  );
}
