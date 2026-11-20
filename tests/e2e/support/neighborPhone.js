// A second neighbor's phone, for the private-message tests. It makes a real message
// key and locks and opens messages with the same encryption library the app uses
// (libsodium), so the tests prove the app's messages work with an outside reader:
// only the right phone can open them.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sodium = require('libsodium-wrappers')

export async function makeNeighborPhone(userId, deviceId = 'bob-phone-1') {
  await sodium.ready
  const pair = sodium.crypto_box_keypair()
  return {
    userId,
    deviceId,
    publicKey: sodium.to_base64(pair.publicKey),
    // The row this phone publishes, the same shape the app saves in user_devices.
    deviceRow: { user_id: userId, device_id: deviceId, public_key: sodium.to_base64(pair.publicKey), created_at: '2026-10-01T00:00:00Z' },
    // Opens a locked copy that was made for this phone. Returns the words, or null.
    open(copy, senderPublicKey) {
      try {
        return sodium.to_string(sodium.crypto_box_open_easy(
          sodium.from_base64(copy.ciphertext), sodium.from_base64(copy.nonce), sodium.from_base64(senderPublicKey), pair.privateKey))
      } catch { return null }
    },
    // Locks words for one phone of another person.
    lockFor(text, theirPublicKey) {
      const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
      const ciphertext = sodium.crypto_box_easy(sodium.from_string(text), nonce, sodium.from_base64(theirPublicKey), pair.privateKey)
      return { ciphertext: sodium.to_base64(ciphertext), nonce: sodium.to_base64(nonce) }
    },
  }
}
