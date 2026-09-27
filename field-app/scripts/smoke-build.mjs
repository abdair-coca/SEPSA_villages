import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function assertSimulatedBuild(distDirectory, backendUrl) {
  if (backendUrl !== "") {
    throw new Error("PWA smoke requires VITE_PILOT_BACKEND_URL explicitly empty in this process; rebuild with simulated mode.");
  }
  let marker;
  try {
    marker = JSON.parse(await readFile(join(distDirectory, "smoke-build.json"), "utf8"));
  } catch {
    throw new Error("PWA smoke requires an explicit simulated build marker; rebuild with VITE_PILOT_BACKEND_URL empty.");
  }
  if (marker.mode !== "simulated-explicit") {
    throw new Error("PWA smoke requires an explicit simulated build; rebuild with VITE_PILOT_BACKEND_URL empty.");
  }
  const html = await readFile(join(distDirectory, "index.html"), "utf8");
  const entryScript = html.match(/<script[^>]+src="(\/assets\/[^"?]+\.js)"/)?.[1];
  if (!entryScript) throw new Error("PWA smoke requires a built dist/index.html entry script.");
  const script = await readFile(join(distDirectory, entryScript.slice(1)), "utf8");
  return { html, entryScript, script };
}

export async function assertPreviewMatchesBuild(appUrl, build, fetchPage = fetch) {
  const htmlResponse = await fetchPage(appUrl);
  if (!htmlResponse.ok) throw new Error(`HTTP ${htmlResponse.status} from ${htmlResponse.url}`);
  const html = await htmlResponse.text();
  if (html !== build.html) throw new Error("Preview on the smoke origin does not serve the verified build HTML.");
  const scriptResponse = await fetchPage(new URL(build.entryScript, appUrl));
  if (!scriptResponse.ok) throw new Error(`HTTP ${scriptResponse.status} from ${scriptResponse.url}`);
  const script = await scriptResponse.text();
  if (script !== build.script) throw new Error("Preview on the smoke origin does not serve the verified build JavaScript.");
}
