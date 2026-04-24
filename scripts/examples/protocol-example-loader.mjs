import { access } from "node:fs/promises";

const PROTOCOL_PACKAGE_MAP = new Map(
  Object.entries({
    "@opensocial/protocol-client":
      "../../packages/protocol-client/dist/index.js",
    "@opensocial/protocol-agent": "../../packages/protocol-agent/dist/index.js",
    "@opensocial/protocol-events":
      "../../packages/protocol-events/dist/index.js",
    "@opensocial/protocol-types": "../../packages/protocol-types/dist/index.js",
  }),
);

export async function resolve(specifier, context, defaultResolve) {
  const target = PROTOCOL_PACKAGE_MAP.get(specifier);
  if (target) {
    const url = new URL(target, import.meta.url);
    try {
      await access(url);
    } catch {
      throw new Error(
        [
          `Missing built SDK entry for ${specifier}.`,
          `Expected ${url.pathname}.`,
          "Build the protocol package dist files before running repository examples.",
          "For agent examples, the needed dist chain is protocol-types -> protocol-client -> protocol-agent.",
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
