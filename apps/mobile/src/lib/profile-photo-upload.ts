import * as ImagePicker from "expo-image-picker";

import { api } from "./api";
import type { ProfilePhotoDraft } from "../types";

function normalizeMimeType(raw: string | null | undefined) {
  if (raw === "image/png" || raw === "image/webp") {
    return raw;
  }
  return "image/jpeg" as const;
}

function fallbackFileName(mimeType: ProfilePhotoDraft["mimeType"]) {
  if (mimeType === "image/png") {
    return "profile-photo.png";
  }
  if (mimeType === "image/webp") {
    return "profile-photo.webp";
  }
  return "profile-photo.jpg";
}

export async function pickProfilePhoto() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo access is needed to pick a profile image.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    mediaTypes: ["images"],
    quality: 0.85,
    selectionLimit: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const mimeType = normalizeMimeType(asset.mimeType);
  const byteSize = asset.fileSize ?? 0;
  if (byteSize <= 0) {
    throw new Error("Could not read the selected image size.");
  }

  return {
    uri: asset.uri,
    fileName: asset.fileName ?? fallbackFileName(mimeType),
    mimeType,
    byteSize,
    width: asset.width,
    height: asset.height,
  } as ProfilePhotoDraft;
}

export async function uploadProfilePhoto(params: {
  userId: string;
  accessToken: string;
  photo: ProfilePhotoDraft;
}) {
  const intent = await api.createProfilePhotoUploadIntent(
    params.userId,
    {
      fileName: params.photo.fileName,
      mimeType: params.photo.mimeType,
      byteSize: params.photo.byteSize,
    },
    params.accessToken,
  );

  const source = await fetch(params.photo.uri);
  const blob = await source.blob();
  const upload = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: intent.requiredHeaders,
    body: blob,
  });

  if (!upload.ok) {
    throw new Error("Could not upload the selected profile photo.");
  }

  return api.completeProfilePhotoUpload(
    params.userId,
    intent.imageId,
    {
      uploadToken: intent.uploadToken,
      byteSize: params.photo.byteSize,
      width: params.photo.width,
      height: params.photo.height,
    },
    params.accessToken,
  );
}
