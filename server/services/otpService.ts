import crypto from 'crypto';

/**
 * Generates a cryptographically secure 6-digit OTP.
 * Result is in the range [100000, 999999].
 */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hashes an OTP using SHA-256.
 * Returns a 64-character lowercase hex string.
 * The raw OTP is never stored — only this hash.
 */
export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Verifies a raw OTP against a stored SHA-256 hash.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
export function verifyOtp(raw: string, hash: string): boolean {
  const rawHash = Buffer.from(hashOtp(raw), 'hex');
  const storedHash = Buffer.from(hash, 'hex');
  if (rawHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(rawHash, storedHash);
}
