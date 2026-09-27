import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertPreviewMatchesBuild, assertSimulatedBuild } from "./smoke-build.mjs";

test("smoke requires explicit simulated build and matching preview bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sepsa-smoke-guard-"));
  try {
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, "index.html"), '<script type="module" src="/assets/index-test.js"></script>');
    await writeFile(join(directory, "assets", "index-test.js"), "verified script");
    await assert.rejects(() => assertSimulatedBuild(directory, ""), /explicit simulated build marker/);
    await writeFile(join(directory, "smoke-build.json"), JSON.stringify({ mode: "other" }));
    await assert.rejects(() => assertSimulatedBuild(directory, ""), /explicit simulated build/);
    await writeFile(join(directory, "smoke-build.json"), JSON.stringify({ mode: "simulated-explicit" }));
    await assert.rejects(() => assertSimulatedBuild(directory, undefined), /VITE_PILOT_BACKEND_URL explicitly empty/);
    const build = await assertSimulatedBuild(directory, "");
    const fetchPage = async (url) => new Response(String(url).endsWith(".js") ? "verified script" : build.html);
    await assertPreviewMatchesBuild("http://127.0.0.1:4182", build, fetchPage);
    await assert.rejects(
      () => assertPreviewMatchesBuild("http://127.0.0.1:4182", build, async () => new Response("stale preview")),
      /verified build HTML/,
    );
    await assert.rejects(
      () => assertPreviewMatchesBuild("http://127.0.0.1:4182", build, async (url) => new Response(String(url).endsWith(".js") ? "stale script" : build.html)),
      /verified build JavaScript/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
