const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/Users/shahalabbas/.gemini/antigravity/brain/1f14a374-6f9c-405e-ab57-9bffbe71a38d';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome-profile');

const SCREENS = [
  { name: 'dashboard', path: '/', role: 'student' },
  { name: 'timetable', path: '/timetable', role: 'student' },
  { name: 'mess', path: '/mess', role: 'student' },
  { name: 'projects', path: '/projects', role: 'student' },
  { name: 'interviews', path: '/interviews', role: 'student' },
  { name: 'admin', path: '/admin', role: 'admin' },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture() {
  for (const screen of SCREENS) {
    const outputPath = path.join(ARTIFACT_DIR, `${screen.name}-mobile.png`);
    
    // Launch Chrome with remote debugging
    const chrome = spawn(CHROME_PATH, [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${PROFILE_DIR}`,
      '--window-size=390,844',
      '--remote-debugging-port=9222',
      `http://localhost:5173${screen.path}`,
    ]);

    await sleep(2500);

    try {
      // Connect to CDP
      const jsonRes = await fetchJson('http://localhost:9222/json');
      const target = jsonRes.find((t) => t.type === 'page');
      if (!target || !target.webSocketDebuggerUrl) {
        console.error('No page target found');
        chrome.kill();
        continue;
      }

      const WebSocket = require('stream').Duplex ? globalThis.WebSocket || null : null;
      // Use chrome --screenshot alternative if WS not built-in:
    } catch (e) {
      console.error(e);
    } finally {
      chrome.kill();
    }
  }
}
