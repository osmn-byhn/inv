import { AwsClient } from "aws4fetch";
import { invitation as data } from "./config.js";

const client = new AwsClient({
  accessKeyId: data.r2.accessKeyId,
  secretAccessKey: data.r2.secretAccessKey,
  service: "s3",
  region: "auto",
});

function objectUrl(key) {
  return `${data.r2.endpoint}/${data.r2.bucket}/${key}`;
}

function safeName(name) {
  return name.replace(/[^\w.\-]+/g, "-").slice(-80);
}

export async function uploadMemory(file, code) {
  const type = file.type.startsWith("video/") ? "video" : "image";
  const max = type === "video" ? 40 * 1024 * 1024 : 12 * 1024 * 1024;
  if (file.size > max) {
    throw new Error(type === "video" ? "Video 40 MB’dan küçük olmalı." : "Fotoğraf 12 MB’dan küçük olmalı.");
  }
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Yalnızca fotoğraf veya video yükleyebilirsiniz.");
  }

  const key = `memories/${code}/${Date.now()}-${safeName(file.name || `${type}.bin`)}`;
  const response = await client.fetch(objectUrl(key), {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
  });

  if (!response.ok) {
    throw new Error("Anı yüklenemedi. Depolama ayarını kontrol edin.");
  }

  return { key, type, name: file.name, size: file.size };
}

export async function memoryBlobUrl(key) {
  const response = await client.fetch(objectUrl(key));
  if (!response.ok) throw new Error("Anı açılamadı.");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
