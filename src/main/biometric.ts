import { systemPreferences, safeStorage } from 'electron'

/**
 * Biometric ("passkey") unlock.
 *
 * The device biometric never provides key material directly. Instead, when the
 * user enrols, the vault's Data Encryption Key is wrapped with the OS keychain
 * via Electron `safeStorage` (Keychain on macOS, DPAPI on Windows, libsecret on
 * Linux). A successful biometric prompt gates the release of that key.
 *
 * macOS Touch ID is supported out of the box. Windows Hello / Linux fingerprint
 * prompts are not exposed by Electron yet — the abstraction below returns
 * `false` there so the UI cleanly falls back to the passcode. See
 * https://github.com/Mr-Don-Leo/PassForge for the Windows Hello native-module
 * follow-up.
 */

export function safeStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function biometricAvailable(): boolean {
  if (!safeStorageAvailable()) return false
  if (process.platform === 'darwin') {
    return typeof systemPreferences.canPromptTouchID === 'function' && systemPreferences.canPromptTouchID()
  }
  // TODO: Windows Hello via UserConsentVerifier, Linux via fprintd/PAM.
  return false
}

/** Prompt the OS biometric. Resolves true on success, false on cancel/failure. */
export async function promptBiometric(reason: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.promptTouchID(reason)
      return true
    } catch {
      return false
    }
  }
  return false
}

/** Wrap the DEK with the OS keychain. Returns base64 ciphertext. */
export function wrapWithOS(dek: Buffer): string {
  return safeStorage.encryptString(dek.toString('base64')).toString('base64')
}

/** Unwrap the DEK previously stored with {@link wrapWithOS}. */
export function unwrapWithOS(blob: string): Buffer {
  const plaintext = safeStorage.decryptString(Buffer.from(blob, 'base64'))
  return Buffer.from(plaintext, 'base64')
}
