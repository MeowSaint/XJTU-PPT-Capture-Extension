const fs = require('node:fs'), path = require('node:path');

function dependency(name) {
  const directory = process.env.PPT_TEST_NODE_MODULES;
  return directory ? require(path.join(path.resolve(directory), name)) : require(name);
}

function browserOptions() {
  if (process.env.PPT_TEST_BROWSER) return {headless: true, executablePath: process.env.PPT_TEST_BROWSER};
  if (process.platform === 'win32') {
    const edge = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe');
    if (fs.existsSync(edge)) return {headless: true, executablePath: edge};
  }
  // Full Chromium's new headless mode supports unpacked extensions.
  return {headless: true, channel: 'chromium'};
}

module.exports = {dependency, browserOptions};
