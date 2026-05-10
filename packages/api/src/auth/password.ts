import bcryptjs from 'bcryptjs'

const MIN_SALT_ROUNDS = 10

export async function hashPassword(
  plaintext: string,
  saltRounds: number = MIN_SALT_ROUNDS
): Promise<string> {
  if (saltRounds < MIN_SALT_ROUNDS) {
    throw new Error(
      `Salt rounds must be at least ${MIN_SALT_ROUNDS}, got ${saltRounds}`
    )
  }
  return bcryptjs.hash(plaintext, saltRounds)
}

export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcryptjs.compare(plaintext, hash)
}
