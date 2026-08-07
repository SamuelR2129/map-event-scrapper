import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const isPrivateOrInternalIp = (ip: string): boolean => {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower.startsWith("::ffff:")) {
    return isPrivateOrInternalIp(lower.slice(7));
  }

  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff")
  );
};

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const BLOCKED_HOST_EXACT = ["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback", "broadcasthost"];

export const isBlockedHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOST_EXACT.includes(host)) return true;

  if (isIP(host)) return isPrivateOrInternalIp(host);

  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

export const isBlockedExternalUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    return isBlockedHostname(url.hostname);
  } catch {
    return true;
  }
};

export type UrlSafetyCheck = {
  safe: boolean;
  reason: string | null;
};

export const isSafeExternalUrl = async (raw: string): Promise<UrlSafetyCheck> => {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { safe: false, reason: `blocked scheme: ${url.protocol}` };
    }

    if (isBlockedHostname(url.hostname)) {
      return { safe: false, reason: `blocked hostname: ${url.hostname}` };
    }

    const records = await lookup(url.hostname, { all: true });
    if (records.length === 0) {
      return { safe: false, reason: `no DNS records for ${url.hostname}` };
    }

    const unsafeRecord = records.find((record) => isPrivateOrInternalIp(record.address));
    if (unsafeRecord) {
      return { safe: false, reason: `${url.hostname} resolves to internal ip ${unsafeRecord.address}` };
    }

    return { safe: true, reason: null };
  } catch (err) {
    return { safe: false, reason: (err as Error).message };
  }
};