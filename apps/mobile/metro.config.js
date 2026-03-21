const path = require("node:path");
const fs = require("node:fs");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const nativeWindConfig = withNativeWind(config, {
  globalClassNamePolyfill: false,
});

const reactNativeCssRoot = path.dirname(
  require.resolve("react-native-css/package.json"),
);
const upstreamResolveRequest = nativeWindConfig.resolver?.resolveRequest;

nativeWindConfig.resolver = {
  ...nativeWindConfig.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName.startsWith("react-native-css/")) {
      const subPath = moduleName.slice("react-native-css/".length);
      const candidates = [
        path.join(reactNativeCssRoot, "dist/commonjs", `${subPath}.js`),
        path.join(reactNativeCssRoot, "dist/commonjs", subPath, "index.js"),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return {
            type: "sourceFile",
            filePath: candidate,
          };
        }
      }
    }

    if (upstreamResolveRequest) {
      return upstreamResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = nativeWindConfig;
