// Keep the unchanged PBKDF2 work off the phone's UI thread. The pinned noble
// implementation reuses keyed HMAC state and needs no background-tab timers.
import { pbkdf2 } from "./vendor/@noble/hashes/pbkdf2.js";
import { sha256 } from "./vendor/@noble/hashes/sha2.js";
import { PBKDF2_ITERATIONS } from "./e2e.mjs";

self.onmessage = event => {
  try {
    const { code, token } = event.data;
    if (typeof code !== "string" || typeof token !== "string") throw new Error("Invalid derivation input");
    const key = pbkdf2(sha256, code, token, { c: PBKDF2_ITERATIONS, dkLen: 32 });
    self.postMessage({ key }, [key.buffer]);
  } catch {
    self.postMessage({ error: "Key derivation failed" });
  }
};
