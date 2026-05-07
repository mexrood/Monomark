/**
 * afterPack hook — runs after win-unpacked is created, before packaging.
 *
 * 1. Waits for AV to release file locks on critical Electron binaries.
 *    Without this, 7zip gets "Cannot open" on locked DLLs and exits code 1.
 *
 * 2. Copies install-portable.ps1 into win-unpacked so the ZIP distribution
 *    ships with a self-contained installer script (for CrowdStrike-affected machines).
 */
const fs = require('fs');
const path = require('path');

async function waitForFile(filePath, maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const fd = fs.openSync(filePath, 'r+');
      fs.closeSync(fd);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return;

  const outDir = context.appOutDir;
  const criticalFiles = [
    'Monomark.exe',
    'vk_swiftshader.dll',
    'vulkan-1.dll',
    'dxil.dll',
    'ffmpeg.dll',
  ];

  console.log('\nafterPack: waiting for AV to release file locks...');

  for (const file of criticalFiles) {
    const filePath = path.join(outDir, file);
    if (!fs.existsSync(filePath)) continue;
    const ok = await waitForFile(filePath, 30000);
    if (ok) {
      console.log(`  unlocked: ${file}`);
    } else {
      console.warn(`  WARNING: ${file} still locked after 30s — 7zip may fail`);
    }
  }

  console.log('afterPack: all critical files accessible, proceeding.');

  // Copy install-portable.ps1 into win-unpacked so the ZIP target includes it.
  const scriptSrc = path.join(__dirname, 'install-portable.ps1');
  const scriptDst = path.join(outDir, 'install-portable.ps1');
  if (fs.existsSync(scriptSrc)) {
    fs.copyFileSync(scriptSrc, scriptDst);
    console.log('afterPack: copied install-portable.ps1 into package.\n');
  }
};
