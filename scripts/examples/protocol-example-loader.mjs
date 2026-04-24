import { access } from "node:fs/promises";

const PROTOCOL_PACKAGE_MAP = new Map(
  Object.entries({
    "@opensocial/protocol-client": {
      path: "../../packages/protocol-client/dist/index.js",
      layer: "client",
      distChain: "protocol-types -> protocol-client",
    },
    "@opensocial/protocol-agent": {
      path: "../../packages/protocol-agent/dist/index.js",
      layer: "agent",
      distChain: "protocol-types -> protocol-client -> protocol-agent",
    },
    "@opensocial/protocol-events": {
      path: "../../packages/protocol-events/dist/index.js",
      layer: "events",
      distChain: "protocol-types -> protocol-events",
    },
    "@opensocial/protocol-types": {
      path: "../../packages/protocol-types/dist/index.js",
      layer: "types",
      distChain: "protocol-types",
    },
  }),
);

export async function resolve(specifier, context, defaultResolve) {
  const target = PROTOCOL_PACKAGE_MAP.get(specifier);
  if (target) {
    const url = new URL(target.path, import.meta.url);
    try {
      await access(url);
    } catch {
      throw new Error(
        [
          `Missing built SDK entry for ${specifier}.`,
          `Example layer: ${target.layer}.`,
          `Expected ${url.pathname}.`,
          `Needed dist chain: ${target.distChain}.`,
          "Run `pnpm test:sdk:readiness-pack -- --preflight` to list client vs agent example prerequisites before executing repository examples.",
        ].join(" "),
      );
    }

    return {
      url: url.href,
      shortCircuit: true,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}
