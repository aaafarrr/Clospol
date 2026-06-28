import crypto from "crypto";
import bcrypt from "bcrypt";

// Derived key from APP_KEY env variable using SHA-256 to guarantee 32-bytes
const getCipherKey = (): Buffer => {
  const appKey = process.env.APP_KEY || "clospol-default-super-secure-key-change-me";
  return crypto.createHash("sha256").update(appKey).digest();
};

/**
 * Encrypt sensitive plain text using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:encrypted_hex
 */
export const encrypt = (text: string): string => {
  const cipherKey = getCipherKey();
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

/**
 * Decrypt cipher text encrypted using AES-256-GCM.
 * Input format: iv_hex:auth_tag_hex:encrypted_hex
 */
export const decrypt = (cipherText: string): string => {
  if (!cipherText) return "";
  
  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format. Expected iv:authTag:encryptedText");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const cipherKey = getCipherKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey, iv);
  
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

/**
 * Hash a plain token (e.g., API key, Shared Link token) using SHA-256.
 * Used to store one-way hashes in the database.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generate a random cryptographically secure token.
 */
export const generateSecureToken = (bytes: number = 32): string => {
  return crypto.randomBytes(bytes).toString("hex");
};

/**
 * Hash a user password using bcrypt.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Verify a plain password against its bcrypt hash.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
