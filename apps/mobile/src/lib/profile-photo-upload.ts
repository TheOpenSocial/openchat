import { api } from "./api";

function normalizeMime(
  mime: string | null | undefined,
  uri: string,
): "image/jpeg" | "image/png" | "image/webp" {
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    return mime;
  }
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error("Could not read image.");
  }
  return res.arrayBuffer();
}

/**
 * Uploads a picked image to the profile photo pipeline (signed PUT + complete).
 */
export async function uploadProfilePhotoFromPickerAsset(
  userId: string,
  accessToken: string,
  asset: {
    uri: string;
    mimeType?: string | null;
    fileSize?: number | null;
  },
): Promise<void> {
  const body = await readUriAsArrayBuffer(asset.uri);
  const byteSize =
    typeof asset.fileSize === "number" && asset.fileSize > 0
      ? asset.fileSize
      : body.byteLength;

  if (byteSize < 512) {
    throw new Error("Photo could not be read.");
  }

  const mimeType = normalizeMime(asset.mimeType, asset.uri);
  const intent = await api.createProfilePhotoUploadIntent(
    userId,
    {
      fileName: "profile.jpg",
      mimeType,
      byteSize,
    },
    accessToken,
  );

  const putRes = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: {
      ...intent.requiredHeaders,
    },
    body,
  });

  if (!putRes.ok) {
    throw new Error("Upload did not complete. Try again.");
  }

  await api.completeProfilePhotoUpload(
    userId,
    intent.imageId,
    {
      uploadToken: intent.uploadToken,
      byteSize,
    },
    accessToken,
  );
}
