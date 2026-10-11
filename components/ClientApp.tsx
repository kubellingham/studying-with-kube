"use client";

import dynamic from "next/dynamic";

// The whole app reads localStorage on first render, so it renders in the
// browser only. That avoids a server/client mismatch flash.
const KubeApp = dynamic(() => import("./KubeApp"), {
  ssr: false,
  loading: () => <div className="flex-1" />,
});

export default function ClientApp() {
  return <KubeApp />;
}
