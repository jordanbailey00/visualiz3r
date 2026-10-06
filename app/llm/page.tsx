import type { Metadata } from "next";
import { LlmExplorerLoader } from "@/components/llm/LlmExplorerLoader";

export const metadata: Metadata = {
  title: "How an LLM works",
  description:
    "Follow a sentence through a real transformer language model in 3D: tokens, embeddings, attention, MLPs and the next-token prediction — every number computed live in your browser.",
};

export default function LlmPage() {
  return <LlmExplorerLoader />;
}
