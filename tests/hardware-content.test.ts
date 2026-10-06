import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { CATALOG } from "../lib/hardware/catalog";
import { getDeviceInfo } from "../lib/hardware/content";

const root = process.cwd();

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
  });
}

/** Literal part ids used by a device model: <Part id="…">, dieId="…", substrateId="…", id: "…" in part tables. */
function partIdsIn(device: string) {
  const ids = new Set<string>();
  for (const f of files(join(root, "components/hardware/models", device))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<Part\b[^>]*?\bid=["']([^"']+)["']/g)) ids.add(m[1]);
    for (const m of src.matchAll(/\b(?:dieId|substrateId|partId)=["']([^"']+)["']/g)) ids.add(m[1]);
  }
  return ids;
}

for (const entry of CATALOG) {
  test(`${entry.id}: every part has a complete explanation`, () => {
    const info = getDeviceInfo(entry.id);
    assert.ok(info, "missing DeviceInfo");
    assert.equal(info.id, entry.id);
    assert.ok(info.intro.length >= 1 && info.intro.every((p) => p.length > 20), "intro");
    assert.ok(info.specs.length >= 3, "device specs");
    assert.ok(info.size > 0, "size");
    for (const [id, p] of Object.entries(info.parts)) {
      assert.ok(p.name.trim(), `${id}: name`);
      assert.ok(p.summary.trim().length > 10, `${id}: summary`);
      assert.ok(p.details.length >= 1 && p.details.every((d) => d.trim().length > 10), `${id}: details`);
    }
    const used = partIdsIn(entry.id);
    assert.ok(used.size >= 5, `expected the model to declare parts, found ${used.size}`);
    for (const id of used) assert.ok(info.parts[id], `part "${id}" is used in the model but has no explanation`);
  });
}
