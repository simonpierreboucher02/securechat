// Client-side encryption utilities using Web Crypto API

export class EncryptionService {
  private keyPair: CryptoKeyPair | null = null;
  
  // Generate RSA key pair for end-to-end encryption
  async generateKeyPair(): Promise<CryptoKeyPair> {
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
    
    this.keyPair = keyPair;
    return keyPair;
  }

  // Export public key to share with other users
  async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("spki", publicKey);
    return this.arrayBufferToBase64(exported);
  }

  // Export private key for storage
  async exportPrivateKey(privateKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    return this.arrayBufferToBase64(exported);
  }

  // Import public key from string
  async importPublicKey(keyData: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(keyData);
    return await crypto.subtle.importKey(
      "spki",
      keyBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["encrypt"]
    );
  }

  // Import private key from string
  async importPrivateKey(keyData: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(keyData);
    return await crypto.subtle.importKey(
      "pkcs8",
      keyBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );
  }

  // Generate AES key for message encryption
  async generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  }

  // Encrypt message with AES-GCM
  async encryptMessage(message: string, aesKey: CryptoKey): Promise<{ encryptedData: string; iv: string }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      data
    );

    return {
      encryptedData: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
    };
  }

  // Decrypt message with AES-GCM
  async decryptMessage(encryptedData: string, iv: string, aesKey: CryptoKey): Promise<string> {
    const encrypted = this.base64ToArrayBuffer(encryptedData);
    const ivBuffer = this.base64ToArrayBuffer(iv);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer,
      },
      aesKey,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  // Encrypt binary data (for media files) with AES-GCM
  async encryptBlob(blob: Blob, aesKey: CryptoKey): Promise<{ encryptedBlob: Blob; iv: string }> {
    const arrayBuffer = await blob.arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      arrayBuffer
    );
    
    const encryptedBlob = new Blob([encrypted], { type: 'application/octet-stream' });
    
    return {
      encryptedBlob,
      iv: this.arrayBufferToBase64(iv)
    };
  }

  // Decrypt binary data from encrypted blob
  async decryptBlob(encryptedBlob: Blob, iv: string, aesKey: CryptoKey): Promise<Blob> {
    const encryptedArrayBuffer = await encryptedBlob.arrayBuffer();
    const ivBuffer = this.base64ToArrayBuffer(iv);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer,
      },
      aesKey,
      encryptedArrayBuffer
    );

    return new Blob([decrypted]);
  }

  // Encrypt AES key with RSA public key
  async encryptAESKey(aesKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("raw", aesKey);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      publicKey,
      exported
    );

    return this.arrayBufferToBase64(encrypted);
  }

  // Decrypt AES key with RSA private key
  async decryptAESKey(encryptedKey: string, privateKey: CryptoKey): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(encryptedKey);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      keyBuffer
    );

    return await crypto.subtle.importKey(
      "raw",
      decrypted,
      {
        name: "AES-GCM",
      },
      true,
      ["encrypt", "decrypt"]
    );
  }

  // Helper methods for base64 encoding/decoding
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const encryptionService = new EncryptionService();
