"use client";

import dynamic from "next/dynamic";
import type { StudySet } from "@/lib/types";

// Like ClientApp: the study UI reads localStorage on first render, so it
// renders in the browser only.
const SharedApp = dynamic(() => import("./SharedApp"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function SharedClient({ set }: { set: StudySet }) {
  return <SharedApp set={set} />;
}
