const fs = require('fs');
const path = require('path');
const os = require('os');

function getChromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  if (process.platform === 'win32') {
    const p = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    if (fs.existsSync(p)) return p;
    const p86 = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
    if (fs.existsSync(p86)) return p86;
    const localApp = path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe');
    if (fs.existsSync(localApp)) return localApp;
    return p;
  } else if (process.platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
    return macPaths[0];
  } else {
    // Linux
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
    return 'google-chrome';
  }
}

function getTempDir(prefix = 'chrome-') {
  const dir = path.join(os.tmpdir(), prefix + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  getChromePath,
  getTempDir
};
