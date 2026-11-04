import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { startBrowserProxy } from "../../scripts/browser-test-proxy.mjs";
import { FAKE_BACKEND } from "../../scripts/browser-test-config.mjs";

const proxy = await startBrowserProxy("http://127.0.0.1:4208", 4209);
const server = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--config", "vite.quote-charge-review-fixture.config.ts"], {
  shell: false, windowsHide: true, stdio: "inherit", env: { ...process.env, ...FAKE_BACKEND },
});
let stopping = false;
const stop = () => { stopping = true; server.kill("SIGTERM"); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
try {
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.once("exit", (code, signal) => code === 0 || (stopping && signal === "SIGTERM") ? done() : reject(new Error(`Fixture exited: ${code}/${signal}`)));
  });
} finally { await proxy.close(); }
