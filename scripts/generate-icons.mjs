/**
 * generate-icons.mjs
 * Run once: node scripts/generate-icons.mjs
 *
 * Reads build/icon.svg → outputs:
 *   build/icon.png        (1024x1024, used by electron-builder for Linux + base)
 *   build/icon@2x.png     (512x512)
 *   build/icons/          (16,24,32,48,64,128,256,512,1024 PNGs — for macOS icns)
 *   build/icon.ico        (multi-size: 16,24,32,48,64,128,256)
 *
 * For macOS ICNS, electron-builder reads build/icons/*.png automatically when
 * icon.icns is missing, as long as the PNG set is provided.
 * Alternatively, on macOS run: iconutil -c icns build/icons.iconset
 */

import sharp from 'sharp'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'build', 'icon.svg')
const svg = readFileSync(svgPath)

mkdirSync(join(root, 'build', 'icons'), { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

// 1. Generate individual PNGs into build/icons/
for (const size of sizes) {
  const out = join(root, 'build', 'icons', `${size}x${size}.png`)
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(out)
  console.log(`✓ ${out}`)
}

// 2. Main build/icon.png at 1024
await sharp(svg, { density: 300 })
  .resize(1024, 1024)
  .png()
  .toFile(join(root, 'build', 'icon.png'))
console.log('✓ build/icon.png (1024x1024)')

// 3. build/icon@2x.png at 512
await sharp(svg, { density: 300 })
  .resize(512, 512)
  .png()
  .toFile(join(root, 'build', 'icon@2x.png'))
console.log('✓ build/icon@2x.png (512x512)')

// 4. build/icon.ico — ICO format with multiple sizes embedded
// ICO = concatenation of PNG-compressed images with an ICO header.
// We build it manually since sharp doesn't output .ico directly.
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

const pngBuffers = await Promise.all(
  icoSizes.map(size =>
    sharp(svg, { density: 300 }).resize(size, size).png().toBuffer()
  )
)

const icoBuffer = buildIco(icoSizes, pngBuffers)
writeFileSync(join(root, 'build', 'icon.ico'), icoBuffer)
console.log('✓ build/icon.ico (multi-size)')

console.log('\nDone! For macOS ICNS on a Mac:')
console.log('  cp -r build/icons build/marrow.iconset')
console.log('  iconutil -c icns build/marrow.iconset -o build/icon.icns')

// ─── ICO builder ─────────────────────────────────────────────────────────────
// Spec: https://en.wikipedia.org/wiki/ICO_(file_format)
function buildIco(sizes, buffers) {
  const n = sizes.length
  // Header: 6 bytes; each dir entry: 16 bytes; then image data
  const headerSize = 6 + n * 16
  const totalSize = headerSize + buffers.reduce((s, b) => s + b.length, 0)

  const ico = Buffer.alloc(totalSize)
  let offset = 0

  // ICONDIR header
  ico.writeUInt16LE(0, offset); offset += 2       // reserved
  ico.writeUInt16LE(1, offset); offset += 2       // type: 1 = ICO
  ico.writeUInt16LE(n, offset); offset += 2       // count

  // Directory entries
  let imageOffset = headerSize
  for (let i = 0; i < n; i++) {
    const size = sizes[i]
    const buf = buffers[i]
    ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1  // width (0=256)
    ico.writeUInt8(size >= 256 ? 0 : size, offset); offset += 1  // height
    ico.writeUInt8(0, offset); offset += 1                        // color count
    ico.writeUInt8(0, offset); offset += 1                        // reserved
    ico.writeUInt16LE(1, offset); offset += 2                     // planes
    ico.writeUInt16LE(32, offset); offset += 2                    // bit count
    ico.writeUInt32LE(buf.length, offset); offset += 4            // size of image data
    ico.writeUInt32LE(imageOffset, offset); offset += 4           // offset to image data
    imageOffset += buf.length
  }

  // Image data
  for (const buf of buffers) {
    buf.copy(ico, offset)
    offset += buf.length
  }

  return ico
}
