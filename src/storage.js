import { invitation as data } from "./config.js";

const DEVICE_KEY = "fb-device-id";
const CODE_KEY = "fb-invite-code";

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Access-Key": data.jsonbin.accessKey,
  };
}

function binUrl() {
  return `https://api.jsonbin.io/v3/b/${data.jsonbin.binId}`;
}

export async function loadRecord() {
  const read = await fetch(`${binUrl()}/latest`, { headers: headers() });
  if (!read.ok) throw new Error("Liste okunamadı.");
  const payload = await read.json();
  const record = payload.record && typeof payload.record === "object"
    ? payload.record
    : {};
  if (!Array.isArray(record.responses)) record.responses = [];
  if (!Array.isArray(record.memories)) record.memories = [];
  if (!record.event) record.event = "Fırat & Birsu Düğünü";
  return record;
}

export async function saveRecord(record) {
  const write = await fetch(binUrl(), {
    method: "PUT",
    headers: {
      ...headers(),
      "X-Bin-Versioning": "false",
    },
    body: JSON.stringify(record),
  });
  if (!write.ok) throw new Error("Kayıt yazılamadı.");
}

export function getSavedCode() {
  return localStorage.getItem(CODE_KEY) || "";
}

export function storeCode(code) {
  localStorage.setItem(CODE_KEY, code);
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const body = await response.json();
    return body.ip || "unknown";
  } catch {
    return "unknown";
  }
}

export async function makeFingerprint() {
  const ip = await getIp();
  const device = getDeviceId();
  const screenSize = `${screen.width}x${screen.height}`;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const hard = await sha256([ip, device, navigator.userAgent, screenSize].join("|"));
  const soft = await sha256([ip, navigator.userAgent, screenSize, zone].join("|"));
  return { hard, soft, ip };
}

export function makeInviteCode(existing = []) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const used = new Set(existing.map((item) => item.code));
  for (let i = 0; i < 40; i += 1) {
    let token = "";
    for (let n = 0; n < 5; n += 1) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const code = `FB-${token}`;
    if (!used.has(code)) return code;
  }
  return `FB-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export function findByFingerprint(record, fingerprint) {
  return record.responses.find(
    (item) => item.fingerprint === fingerprint.hard || item.softFingerprint === fingerprint.soft,
  );
}

export function findByCode(record, code) {
  const normalized = (code || "").trim().toUpperCase();
  if (!normalized) return undefined;
  return record.responses.find((item) => item.code === normalized);
}
