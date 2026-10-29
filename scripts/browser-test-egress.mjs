/**
 * A workerd outbound Worker is a capability boundary for fetch AND connect.
 * Do not replace it with a Node fetch callback: Miniflare's callback wrapper
 * enables connect_pass_through, which permits raw TCP to bypass that callback.
 *
 * Supported APIs: Miniflare's Worker outboundService and workerd globalOutbound.
 * https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/README.md
 * https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp
 */
export const DENY_WORKER_NAME = "liftgo-browser-tests-deny-egress";

export const denyOutbound = Object.freeze({
  type: "worker",
  worker: DENY_WORKER_NAME,
});

export const DENIED_BODY = "Browser test Worker egress denied";

export const denyWorker = {
  config: {
    name: DENY_WORKER_NAME,
    compatibilityDate: "2026-08-01",
    manifest: {
      mainModule: "deny-egress.mjs",
      modules: {
        "deny-egress.mjs": {
          type: "esm",
          contents: `export default {
  fetch() {
    return new Response(${JSON.stringify(DENIED_BODY)}, {
      status: 503,
      headers: { "x-browser-test-egress": "denied" },
    });
  },
};`,
        },
      },
    },
  },
  // No connect handler and no connect_pass_through flag: workerd rejects TCP
  // before opening a connection. Self-reference also withholds an internet
  // capability from this Worker if its code is accidentally changed later.
  dev: { outboundService: denyOutbound, unsafeRegisterWorker: false },
};
