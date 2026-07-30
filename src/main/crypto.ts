import crypto from 'node:crypto'

/**
 * Key-derivation and symmetric-encryption primitives for the vault.
 *
 * We use Node's built-in scrypt (memory-hard KDF) and AES-256-GCM
 * (authenticated encryption). No native modules are required, which keeps
 * cross-platform packaging reliable.
 */

// scrypt parameters. N is the CPU/memory cost. 2^17 needs ~128 MiB of memory
// and roughly a second to derive on a modern machine — deliberately slow to
// blunt brute-forcing of the low-entropy 6-digit passcode.
export const KDF = {
  N: 1 << 17,
  r: 8,
  p: 1,
  keylen: 32,
  maxmem: 300 * 1024 * 1024
} as const

export interface Sealed {
  iv: string // base64
  ct: string // base64
  tag: string // base64
}

export function randomBytes(n: number): Buffer {
  return crypto.randomBytes(n)
}

/** Derive a 256-bit key-encryption key from the passcode. */
export function deriveKey(passcode: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passcode, salt, KDF.keylen, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: KDF.maxmem
  })
}

/** AES-256-GCM encrypt. `key` must be 32 bytes. */
export function seal(key: Buffer, plaintext: Buffer): Sealed {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64')
  }
}

/**
 * AES-256-GCM decrypt. Throws if the auth tag does not verify — which is how
 * we detect a wrong passcode (the derived key won't match).
 */
export function open(key: Buffer, sealed: Sealed): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()])
}
