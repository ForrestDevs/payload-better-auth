import crypto from 'crypto'

/**
 * Mimics Payload's internal password hashing using pbkdf2
 *
 * This generates a hash compatible with Payload's internal auth system
 * so that passwords set via better-auth can be used with Payload admin panel
 */
function pbkdf2Promisified(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.pbkdf2(password, salt, 25000, 512, 'sha256', (err, hashRaw) =>
      err ? reject(err) : resolve(hashRaw),
    ),
  )
}

/**
 * Generates random bytes for the salt
 */
function randomBytes(): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.randomBytes(32, (err, saltBuffer) => (err ? reject(err) : resolve(saltBuffer))),
  )
}

/**
 * Custom implementation of password hashing that matches Payload's format
 *
 * Instead of using better-auth's scrypt, this uses pbkdf2 with the same
 * parameters as Payload CMS
 *
 * @param password The password to hash
 * @returns A string in the format {salt}:{hash}
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltBuffer = await randomBytes()
  const salt = saltBuffer.toString('hex')

  const hashRaw = await pbkdf2Promisified(password, salt)
  const hash = hashRaw.toString('hex')

  return `${salt}:${hash}`
}

/**
 * Verifies a password against a stored hash
 *
 * This function is flexible and can handle:
 * 1. A combined string in format {salt}:{hash} (for account passwords)
 * 2. When salt and hash need to be combined from user records
 *
 * @param params Object containing the hash and password
 * @returns Boolean indicating if the password matches
 */
export const verifyPassword = async ({
  hash,
  password,
  salt,
}: {
  hash: string
  password: string
  salt?: string
}): Promise<boolean> => {
  let saltValue: string
  let storedHash: string

  // If salt is provided separately (from user record), use it with the hash
  if (salt) {
    saltValue = salt
    storedHash = hash
  } else {
    // Otherwise, split the combined format (from account.password)
    const parts = hash.split(':')
    if (parts.length !== 2) {
      return false
    }
    ;[saltValue, storedHash] = parts
  }

  if (!saltValue || !storedHash) {
    return false
  }

  const hashRaw = await pbkdf2Promisified(password, saltValue)
  const computedHash = hashRaw.toString('hex')

  return storedHash === computedHash
}
