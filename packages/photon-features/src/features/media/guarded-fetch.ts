import type { MediaStream } from "./safety.js";
import { lookup as dnsLookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { abortable, reject, validMime } from "./safety.js";

export interface Address { address: string; family: number }
export interface FetchPolicy { approvedHosts: readonly string[]; maxRedirects?: number }
export interface Download { stream: MediaStream; mimeType: string; close(): void }
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes("%")) return false;
  const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  const groups = normalized.split(":");
  const first = parseInt(groups[0]!, 16), second = parseInt(groups[1] || "0", 16);
  // Only global unicast, excluding transition/tunneling and special/documentation blocks.
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3fff &&
    !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8));
}
export function approvedUrl(input: string, policy: FetchPolicy): URL {
  let url: URL;
  try { url = new URL(input); } catch { return reject("invalid URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
    (url.port && url.port !== "443") || input.length > 2048 ||
    !policy.approvedHosts.includes(url.hostname) || url.hostname.endsWith(".") || isIP(url.hostname.replace(/^\[|\]$/g, ""))) reject("URL not approved");
  return url;
}
export interface HopResponse extends Download { status: number; location?: string }
export type PinnedRequest = (url: URL, address: Address, signal: AbortSignal) => Promise<HopResponse>;
/** DNS is not repeated by the connection. TLS still checks the original hostname. No proxy or pooled socket. */
export function createPinnedRequest(httpsRequest: typeof request = request): PinnedRequest {
  return (url, pinned, signal) => new Promise((resolve, fail) => {
  const req = httpsRequest(url, {
    method: "GET", agent: false, signal, servername: url.hostname,
    headers: { "Accept-Encoding": "identity" },
    lookup: (_host, options, callback) => {
      if (typeof options === "object" && options.all) callback(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    },
  }, response => {
    const remote = response.socket.remoteAddress;
    const normalize = (address: string) => address.startsWith("::ffff:") ? address.slice(7) : address;
    if (!remote || normalize(remote) !== normalize(pinned.address)) {
      response.destroy(); req.destroy(); fail(new Error("MEDIA_ADDRESS_CHANGED")); return;
    }
    const encoding = response.headers["content-encoding"];
    if (encoding && encoding !== "identity") {
      response.destroy(); fail(new Error("MEDIA_ENCODING_REJECTED")); return;
    }
    resolve({ status: response.statusCode ?? 0, location: response.headers.location,
      mimeType: String(response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase(),
      stream: Readable.toWeb(response), close: () => { response.destroy(); req.destroy(); } });
  });
  req.once("socket", socket => {
    socket.once("connect", () => {
      const peer = socket.remoteAddress?.replace(/^::ffff:/, "");
      if (peer !== pinned.address.replace(/^::ffff:/, "")) req.destroy(new Error("MEDIA_ADDRESS_CHANGED"));
    });
  });
  req.once("error", fail);
  req.end();
  });
}
export const requestPinned = createPinnedRequest();
/** Dependency seams are host-only and exist for deterministic DNS/rebinding tests. */
export function createGuardedFetcher(policy: FetchPolicy, dependencies: {
  lookup?: (host: string) => Promise<Address[]>; request?: PinnedRequest;
} = {}) {
  const lookup = dependencies.lookup ?? (host => dnsLookup(host, { all: true, verbatim: true }));
  const send = dependencies.request ?? requestPinned;
  const redirects = policy.maxRedirects ?? 3;
  if (!Number.isInteger(redirects) || redirects < 0 || redirects > 5) reject("redirect limit");
  return async (input: string, signal: AbortSignal): Promise<Download> => {
    let current = input;
    for (let hop = 0; hop <= redirects; hop++) {
      const url = approvedUrl(current, policy);
      const addresses = await abortable(lookup(url.hostname), signal);
      if (!addresses.length || addresses.some(a => !isPublicAddress(a.address) || isIP(a.address) !== a.family)) reject("nonpublic destination");
      const response = await abortable(send(url, addresses[0]!, signal), signal);
      if ([301,302,303,307,308].includes(response.status)) {
        response.close();
        if (!response.location || hop === redirects) reject("redirect limit");
        current = new URL(response.location, url).href;
        continue;
      }
      if (response.status !== 200) { response.close(); reject("download response"); }
      try { validMime(response.mimeType); } catch (error) { response.close(); throw error; }
      return response;
    }
    return reject("redirect limit");
  };
}
