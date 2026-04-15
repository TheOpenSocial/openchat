const PROTOCOL_PACKAGE_MAP = new Map(
  Object.entries({
    "@opensocial/protocol-client":
      "../../packages/protocol-client/dist/index.js",
    "@opensocial/protocol-events":
      "../../packages/protocol-events/dist/index.js",
    "@opensocial/protocol-types": "../../packages/protocol-types/dist/index.js",
  }),
);

export async function resolve(specifier, context, defaultResolve) {
  const target = PROTOCOL_PACKAGE_MAP.get(specifier);
  if (target) {
    return {
      url: new URL(target, import.meta.url).href,
      shortCircuit: true,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}
