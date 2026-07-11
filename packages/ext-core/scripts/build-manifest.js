import fs from 'fs';
import path from 'path';

const browser = process.env.TARGET_BROWSER || 'chrome';
const manifestSrc = browser === 'firefox' ? 'manifest.firefox.json' : 'manifest.chrome.json';
const outDir = process.env.OUT_DIR || './dist';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.copyFileSync(manifestSrc, path.join(outDir, 'manifest.json'));
console.log(`Copied ${manifestSrc} -> ${outDir}/manifest.json`);

// Copy icons directory to destination
const iconsSrc = './icons';
const iconsDest = path.join(outDir, 'icons');
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDest, { recursive: true });
  console.log(`Copied ${iconsSrc} -> ${iconsDest}`);
}
