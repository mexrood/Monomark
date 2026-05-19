import { randomBytes } from 'crypto'

/** Generate a crypto-secure 8-hex-char block ID. */
export function generateBlockId(): string {
  return randomBytes(4).toString('hex')
}

/** True if the string is a well-formed block ID (8 lowercase hex chars). */
export function isValidBlockId(s: string): boolean {
  return /^[a-f0-9]{8}$/.test(s)
}
