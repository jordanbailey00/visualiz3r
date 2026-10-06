"use client";

import dynamic from "next/dynamic";
import { LoadingScreen } from "@/components/site/LoadingScreen";

const LlmExplorer = dynamic(() => import("./LlmExplorer"), {
  ssr: false,
  loading: () => <LoadingScreen label="Loading the model" />,
});

export function LlmExplorerLoader() {
  return <LlmExplorer />;
}
