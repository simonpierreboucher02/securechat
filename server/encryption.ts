import { randomBytes, createHash } from "crypto";

// Generate a cryptographically secure recovery key
export function generateRecoveryKey(): string {
  const buffer = randomBytes(32);
  return buffer.toString('base64').replace(/[+/=]/g, (char) => {
    switch (char) {
      case '+': return '-';
      case '/': return '_';
      case '=': return '';
      default: return char;
    }
  });
}

// Hash the recovery key for storage
export function hashRecoveryKey(recoveryKey: string): string {
  return createHash('sha256').update(recoveryKey).digest('hex');
}

// Verify recovery key against stored hash
export function verifyRecoveryKey(recoveryKey: string, storedHash: string): boolean {
  const computedHash = hashRecoveryKey(recoveryKey);
  return computedHash === storedHash;
}

// Generate RSA key pair for encryption
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}
