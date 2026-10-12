/**
 * BSC Textiles HRMS — Desktop Application Icon Generator
 * Generates high-definition multi-resolution icon.ico and icon.png
 * using the official authentic BSC Textiles logo (frontend/public/bsc_logo.png).
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

interface IconSize {
  size: number;
  buffer: Buffer;
}

function buildMultiResolutionIco(images: IconSize[]): Buffer {
  const count = images.length;
  // Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  // Entries: count * 16 bytes
  const entries = Buffer.alloc(count * 16);
  let currentOffset = 6 + count * 16;

  for (let i = 0; i < count; i++) {
    const { size, buffer } = images[i];
    const entryOffset = i * 16;

    // Width/Height: 0 means 256px
    entries.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0);
    entries.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    entries.writeUInt8(0, entryOffset + 2); // Color count
    entries.writeUInt8(0, entryOffset + 3); // Reserved
    entries.writeUInt16LE(1, entryOffset + 4); // Color planes
    entries.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    entries.writeUInt32LE(buffer.length, entryOffset + 8); // Size
    entries.writeUInt32LE(currentOffset, entryOffset + 12); // Offset

    currentOffset += buffer.length;
  }

  const imageBuffers = images.map(img => img.buffer);
  return Buffer.concat([header, entries, ...imageBuffers]);
}

async function generateBrandedIcons() {
  const logoSourcePath = path.resolve(__dirname, '../frontend/public/bsc_logo.png');
  const desktopAssetsDir = path.resolve(__dirname, '../desktop/assets');

  if (!fs.existsSync(logoSourcePath)) {
    throw new Error(`Source logo not found at ${logoSourcePath}`);
  }

  if (!fs.existsSync(desktopAssetsDir)) {
    fs.mkdirSync(desktopAssetsDir, { recursive: true });
  }

  console.log(`Processing official BSC Textiles logo from: ${logoSourcePath}`);

  // Standard Windows icon dimensions
  const sizes = [256, 128, 64, 48, 32, 16];
  const renderedImages: IconSize[] = [];

  for (const size of sizes) {
    const buffer = await sharp(logoSourcePath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    renderedImages.push({ size, buffer });
    console.log(`Rendered ${size}x${size} icon buffer (${buffer.length} bytes)`);
  }

  // Create composite multi-resolution .ico
  const icoBuffer = buildMultiResolutionIco(renderedImages);
  const icoDest = path.join(desktopAssetsDir, 'icon.ico');
  fs.writeFileSync(icoDest, icoBuffer);
  console.log(`Successfully generated multi-resolution icon: ${icoDest} (${icoBuffer.length} bytes)`);

  // Create primary 256x256 and 512x512 icon.png for Electron / Start Menu / Taskbar
  const png256Buffer = await sharp(logoSourcePath)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const pngDest = path.join(desktopAssetsDir, 'icon.png');
  fs.writeFileSync(pngDest, png256Buffer);
  console.log(`Successfully generated desktop branding icon: ${pngDest} (${png256Buffer.length} bytes)`);
}

generateBrandedIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
