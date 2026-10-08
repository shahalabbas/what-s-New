const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="120" ry="120" fill="#0A2540" />
  <rect x="101" y="140" width="310" height="96" rx="48" fill="#FFFFFF" />
  <rect x="101" y="276" width="194" height="96" rx="48" fill="#5B96F7" />
  <circle cx="363" cy="324" r="48" fill="#FFA000" />
</svg>`;

// Maskable icon with 20% safe zone padding
const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0A2540" />
  <g transform="translate(51.2, 51.2) scale(0.8)">
    <rect width="512" height="512" rx="120" ry="120" fill="#0A2540" />
    <rect x="101" y="140" width="310" height="96" rx="48" fill="#FFFFFF" />
    <rect x="101" y="276" width="194" height="96" rx="48" fill="#5B96F7" />
    <circle cx="363" cy="324" r="48" fill="#FFA000" />
  </g>
</svg>`;

async function generate() {
  const publicDir = path.resolve(__dirname, '../public');
  const iconsDir = path.join(publicDir, 'icons');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

  // 1. Write favicon.svg
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), SVG_CONTENT);
  console.log('✓ Created public/favicon.svg');

  // 2. Generate PNGs using Sharp
  const svgBuffer = Buffer.from(SVG_CONTENT);
  const maskableBuffer = Buffer.from(MASKABLE_SVG);

  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512.png'));
  console.log('✓ Created public/icons/icon-512.png');

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192.png'));
  console.log('✓ Created public/icons/icon-192.png');

  // 180x180 (Apple Touch Icon)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Created public/apple-touch-icon.png');

  // Maskable 512x512
  await sharp(maskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable.png'));
  console.log('✓ Created public/icons/icon-maskable.png');

  // 32x32 Favicon PNG
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('✓ Created public/favicon-32x32.png');
}

generate().catch(console.error);
