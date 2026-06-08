#!/usr/bin/env node
/**
 * copy-fonts.js
 *
 * Copies the Ionicons TTF from @expo/vector-icons into assets/fonts/ so Metro
 * can include it in its asset graph. This is the only reliable way to make
 * @expo/vector-icons work on Expo web (Metro bundler) in SDK 50+.
 *
 * Run: node scripts/copy-fonts.js
 * Also wired into the "postinstall" script so it runs automatically.
 */

const fs = require('fs');
const path = require('path');

const fonts = [
  {
    src: path.resolve(
      __dirname,
      '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'
    ),
    dest: path.resolve(__dirname, '../assets/fonts/Ionicons.ttf'),
  },
];

const destDir = path.resolve(__dirname, '../assets/fonts');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log('[copy-fonts] Created assets/fonts/');
}

for (const { src, dest } of fonts) {
  if (!fs.existsSync(src)) {
    console.error(`[copy-fonts] Source not found: ${src}`);
    console.error('[copy-fonts] Run: pnpm install');
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  const size = fs.statSync(dest).size;
  console.log(`[copy-fonts] ✓ Ionicons.ttf (${(size / 1024).toFixed(0)} KB) → assets/fonts/Ionicons.ttf`);
}

console.log('[copy-fonts] Done.');
