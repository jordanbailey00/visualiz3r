"use client";

import type { BpeTokenizer } from "@/lib/llm/tokenizer";
import type { VizLayout } from "@/lib/llm/viz/layout";
import { Label } from "./Label";
import { showToken } from "./Vocab";

/** Token names at the start of every block row, so each lane is identifiable anywhere. */
export function LaneLabels({ layout, tokenizer, tokens }: { layout: VizLayout; tokenizer: BpeTokenizer; tokens: number[] }) {
  return (
    <group>
      {layout.rowTop.slice(1).map((top) =>
        tokens.map((id, t) => (
          <Label
            key={`${top}:${t}`}
            text={showToken(tokenizer.isSpecial(id) ? "" : tokenizer.tokenString(id))}
            position={[-1.4, top - t - 0.5, 0.1]}
            size={0.62}
            color="#cbd5e1"
            anchorX="right"
            mono
            fadeFar={150}
          />
        )),
      )}
    </group>
  );
}
