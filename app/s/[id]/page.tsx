import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SharedClient from "@/components/SharedClient";
import { loadSharedSet } from "@/lib/shareStore";

export const metadata: Metadata = {
  title: "Shared set · StudyingKube",
  robots: { index: false },
};

// A study set opened from its share link. proxy.ts has already checked the
// access password before this runs.
export default async function SharedSetPage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const set = await loadSharedSet(id);
  if (!set) notFound();
  return <SharedClient set={set} />;
}
