import { Asset } from "expo-asset";

let cachedPhotoAsset: {
  uri: string;
  mimeType: "image/png";
  fileSize: number | null;
} | null = null;

export function shouldUseE2EProfilePhotoShortcut() {
  return __DEV__ && Boolean(process.env.EXPO_PUBLIC_E2E_SESSION_B64?.trim());
}

export async function getE2EProfilePhotoAsset() {
  if (cachedPhotoAsset) {
    return cachedPhotoAsset;
  }

  const asset = Asset.fromModule(require("../../assets/icon.png"));
  if (!asset.localUri) {
    await asset.downloadAsync();
  }

  cachedPhotoAsset = {
    uri: asset.localUri ?? asset.uri,
    mimeType: "image/png",
    fileSize: typeof asset.fileSize === "number" ? asset.fileSize : null,
  };

  return cachedPhotoAsset;
}
