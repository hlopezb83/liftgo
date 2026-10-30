import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { buildEnvironment, runServer } from "../../scripts/browser-test-server.mjs";
import { startBrowserProxy } from "../../scripts/browser-test-proxy.mjs";
import { assertGroupCFakeBuild } from "./artifactGuard.ts";
import { appOrigin, appProxyOrigin, buildRoot, componentOrigin, componentProxyOrigin, repositoryRoot } from "./paths.ts";

async function serveComponents() {
  const proxy = await startBrowserProxy(componentOrigin, Number(new URL(componentProxyOrigin).port));
  let child;
  let stopping = false;
  const stop = () => { stopping = true; child?.kill("SIGTERM"); };
  try {
    child = spawn(process.execPath, [
      resolve(repositoryRoot, "node_modules/vite/bin/vite.js"), "--config", "vite.group-c-fixture.config.ts",
    ], { cwd: repositoryRoot, env: buildEnvironment(), shell: false, stdio: "inherit", windowsHide: true });
    await new Promise((done, reject) => {
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0 || (stopping && signal === "SIGTERM")) done();
        else reject(new Error(`Group C fixture exited (${code}, ${signal ?? "no signal"})`));
      });
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    child?.kill();
    await proxy.close();
  }
}

try {
  if (process.argv.includes("--components")) {
    await serveComponents();
  } else {
    // The shared Worker harness owns this checkout's build and empty env file.
    assert.equal(buildRoot, repositoryRoot, "Group C must serve this checkout's isolated build");
    assertGroupCFakeBuild();
    Object.assign(process.env, { SMOKE_REUSE_BUILD: "1", SMOKE_BASE_URL: appOrigin, SMOKE_PROXY_URL: appProxyOrigin });
    await runServer();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
