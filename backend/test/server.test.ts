import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = existsSync(resolve(testDirectory, "../src/server.ts")) ? resolve(testDirectory, "..") : resolve(testDirectory, "../..");
const tsxCli = resolve(backendDirectory, "node_modules/tsx/dist/cli.mjs");
const sourceEntrypoint = resolve(backendDirectory, "src/server.ts");
const compiledEntrypoint = resolve(backendDirectory, "dist/src/server.js");

test("tsx watch starts the TypeScript server and health reports an unavailable database", async () => {
  await assertServerStarts([tsxCli, "watch", sourceEntrypoint]);
});

if (existsSync(compiledEntrypoint)) {
  test("the compiled server starts from the tsconfig output path", async () => {
    await assertServerStarts([compiledEntrypoint]);
  });
}

async function assertServerStarts(command: string[]): Promise<void> {
  const port = await reservePort();
  const child = spawn(process.execPath, command, {
    cwd: backendDirectory,
    env: {
      ...process.env,
      DATABASE_URL: "postgres://127.0.0.1:1/pilot_provisional",
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = { stdout: "", stderr: "" };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { output.stdout += chunk; });
  child.stderr?.on("data", (chunk: string) => { output.stderr += chunk; });

  try {
    const response = await waitForHealth(child, `http://127.0.0.1:${port}/healthz`, output);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable", source: "PILOT_PROVISIONAL" });
    assert.match(output.stdout, /PILOT_PROVISIONAL_BACKEND listening on 127\.0\.0\.1:/);
  } finally {
    await stop(child);
  }
}

async function waitForHealth(child: ChildProcess, url: string, output: { stdout: string; stderr: string }): Promise<Response> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before listening. stdout=${output.stdout} stderr=${output.stderr}`);
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`Server did not become healthy. Last error=${String(lastError)} stdout=${output.stdout} stderr=${output.stderr}`);
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local test port.");
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return port;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise()));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2_000)]);
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([exited, delay(2_000)]);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
