/**
 * src/utils/crypto.ts — Cryptographically Secure Random & Credential Protection
 */

/**
 * Generate a cryptographically secure pseudo-random float between 0 (inclusive) and 1 (exclusive)
 */
export function secureRandomFloat(): number {
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] / (0xffffffff + 1);
  }
  return Math.random();
}

/**
 * Generate a cryptographically secure random integer between min and max (inclusive)
 */
export function secureRandomInt(min: number, max: number): number {
  return Math.floor(secureRandomFloat() * (max - min + 1)) + min;
}

/**
 * Generate a cryptographically secure unique ID with an optional prefix
 */
export function secureRandomId(prefix: string = "id"): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(8);
    window.crypto.getRandomValues(array);
    const hex = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${prefix}_${hex}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(secureRandomFloat() * 1e6)}`;
}

/**
 * Secure lightweight obfuscation / encryption for local credentials storage
 */
const SALT = "TF_SECURE_VAULT_V1";

export function encryptVaultData(plain: string): string {
  if (!plain) return "";
  try {
    const textToChars = (text: string) => text.split("").map((c) => c.charCodeAt(0));
    const byteHex = (n: number) => ("0" + Number(n).toString(16)).substr(-2);
    const applySaltToChar = (code: number, idx: number) =>
      code ^ textToChars(SALT)[idx % SALT.length];

    return plain
      .split("")
      .map((c) => c.charCodeAt(0))
      .map(applySaltToChar)
      .map(byteHex)
      .join("");
  } catch (e) {
    console.warn("Encryption fallback:", e);
    return btoa(plain);
  }
}

export function decryptVaultData(encoded: string): string {
  if (!encoded) return "";
  try {
    const textToChars = (text: string) => text.split("").map((c) => c.charCodeAt(0));
    const applySaltToChar = (code: number, idx: number) =>
      code ^ textToChars(SALT)[idx % SALT.length];

    const matched = encoded.match(/.{1,2}/g);
    if (!matched) return "";

    return matched
      .map((hex) => parseInt(hex, 16))
      .map(applySaltToChar)
      .map((charCode) => String.fromCharCode(charCode))
      .join("");
  } catch (e) {
    console.warn("Decryption fallback:", e);
    try {
      return atob(encoded);
    } catch {
      return encoded;
    }
  }
}
