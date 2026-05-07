import { formatTimestamp } from './timestamp'

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
}

function mimeToExt(mime: string): string {
  return MIME_TO_EXT[mime] ?? '.png'
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

async function findFreeName(basePath: string, ext: string): Promise<string> {
  const candidate = `${basePath}${ext}`
  if (!(await window.marrow.vault.fileExists(candidate))) return candidate
  for (let i = 2; i < 100; i++) {
    const c = `${basePath}-${i}${ext}`
    if (!(await window.marrow.vault.fileExists(c))) return c
  }
  return `${basePath}-${Date.now()}${ext}`
}

/** Save a Blob to <vault>/_attachments/ and return the relative path. */
export async function attachImageFromBlob(blob: Blob): Promise<string> {
  const ext = mimeToExt(blob.type)
  const baseName = `image-${formatTimestamp(new Date())}`
  const relPath = await findFreeName(`_attachments/${baseName}`, ext)
  const buf = await blob.arrayBuffer()
  const base64 = arrayBufferToBase64(buf)
  await window.marrow.vault.writeBinary(relPath, base64)
  return relPath
}
