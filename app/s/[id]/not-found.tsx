import Link from "next/link";
import { Brand } from "@/components/ui";

export default function SharedSetNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Brand />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">This share link doesn&apos;t open a set</h1>
      <p className="mt-2 text-muted">Check that the whole link was copied. Links are case-sensitive.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-accent hover:underline">
        Go to StudyingKube
      </Link>
    </main>
  );
}
