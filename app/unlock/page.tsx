import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { accessPassword } from "@/lib/access";
import UnlockForm from "@/components/UnlockForm";

export const metadata: Metadata = {
  title: "StudyingKube",
  robots: { index: false },
};

// Shown in place of any page until the shared access password is entered
// (see proxy.ts). Deliberately reveals nothing about the page that was asked for.
export default async function UnlockPage() {
  await connection(); // read the env var per request, not at build time
  if (!accessPassword()) redirect("/");
  return <UnlockForm />;
}
