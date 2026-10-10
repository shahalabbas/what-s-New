import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.resolve(rootDir, 'dist')
const artifactsDir = '/Users/shahalabbas/.gemini/antigravity/brain/1f14a374-6f9c-405e-ab57-9bffbe71a38d'

// Static server for dist with SPA fallback
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0]
  let filePath = path.join(distDir, reqPath)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const mime = mimeTypes[ext] || 'application/octet-stream'
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500)
        res.end('Server error')
        return
      }
      res.writeHead(200, { 'Content-Type': mime })
      res.end(data)
    })
  } else {
    // SPA Fallback to index.html
    const indexPath = path.join(distDir, 'index.html')
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(data)
    })
  }
})

await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve))
console.log('Static server listening on http://127.0.0.1:4173')

// Spawn Chrome with exact 390x844 mobile viewport
const tmpDir = '/tmp/chrome_clean_' + Date.now()
const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--disable-gpu',
  '--remote-debugging-port=9222',
  '--remote-allow-origins=*',
  `--user-data-dir=${tmpDir}`,
  '--window-size=390,844',
  '--force-device-scale-factor=2',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
])

// Wait for CDP page target
let wsUrl = null
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9222/json')
    const list = await res.json()
    const pageTarget = list.find((t) => t.type === 'page') || list[0]
    if (pageTarget && pageTarget.webSocketDebuggerUrl) {
      wsUrl = pageTarget.webSocketDebuggerUrl
      break
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200))
}

if (!wsUrl) {
  console.error('Failed to get WebSocket debugger URL from Chrome')
  chromeProc.kill()
  server.close()
  process.exit(1)
}

const ws = new WebSocket(wsUrl)
let id = 1
const pending = new Map()

ws.onmessage = (evt) => {
  const msg = JSON.parse(evt.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(msg.error)
    else resolve(msg.result)
  }
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = id++
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

await new Promise((resolve) => (ws.onopen = resolve))

await send('Page.enable')
await send('Runtime.enable')

// ─── 1. CAPTURE ADD PROJECT MODAL ON PROJECTS SCREEN ────────────────────────
console.log('Navigating to /projects...')
await send('Page.navigate', {
  url: 'http://127.0.0.1:4173/projects?email=shahalabbas.dem2026@iimu.ac.in',
})

await new Promise((r) => setTimeout(r, 2000))

// Click "+ Add Project" button
const addClickRes = await send('Runtime.evaluate', {
  expression: `
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Project') || b.textContent.includes('+ Add'));
    if (addBtn) {
      addBtn.click();
      'clicked add btn successfully';
    } else {
      'add btn not found';
    }
  `,
})
console.log('Add Button Result:', addClickRes.result?.value)

await new Promise((r) => setTimeout(r, 800))

// Fill Add Project Form with realistic demo content
await send('Runtime.evaluate', {
  expression: `
    const titleInput = document.querySelector('input[placeholder*="Case Study"], input[maxLength="120"]');
    if (titleInput) {
      titleInput.value = 'DSO 503 · Machine Learning Term Project Milestone 1';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const descInput = document.querySelector('textarea[placeholder*="guidelines"], textarea[maxLength="2000"]');
    if (descInput) {
      descInput.value = 'Submit exploratory data analysis notebooks and baseline model report.\\nDataset link: https://drive.google.com/drive/folders/dso503-project\\nScoring Rubric: EDA (40%), Model Accuracy (40%), Documentation (20%)';
      descInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const groupInput = document.querySelector('input[type="number"]');
    if (groupInput) {
      groupInput.value = '3';
      groupInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  `,
})

await new Promise((r) => setTimeout(r, 800))

const ss1 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(path.join(artifactsDir, '06_add_project_modal.png'), Buffer.from(ss1.data, 'base64'))
console.log('Saved 06_add_project_modal.png')

// ─── 2. CAPTURE SUPERSET EMAIL REVIEW FORM WITH TEST FIXTURE ────────────────
console.log('Navigating to /admin...')
await send('Page.navigate', {
  url: 'http://127.0.0.1:4173/admin?email=shahalabbas.dem2026@iimu.ac.in',
})

await new Promise((r) => setTimeout(r, 2000))

// Open Paste Email modal
await send('Runtime.evaluate', {
  expression: `
    const pasteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Paste Email'));
    if (pasteBtn) pasteBtn.click();
  `,
})

await new Promise((r) => setTimeout(r, 800))

// Paste fixture and click parse
const fixturePath = path.resolve(rootDir, 'fixtures/email/superset_open_for_application_am.eml')
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8')

await send('Runtime.evaluate', {
  expression: `
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = ${JSON.stringify(fixtureContent)};
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const parseBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Parse & Stage'));
      if (parseBtn) parseBtn.click();
    }
  `,
})

await new Promise((r) => setTimeout(r, 1200))

// If staged item is in list, click Review button to open ItemReviewModal
await send('Runtime.evaluate', {
  expression: `
    const reviewBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Review');
    if (reviewBtn) reviewBtn.click();
  `,
})

await new Promise((r) => setTimeout(r, 1000))

const ss2 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(path.join(artifactsDir, '07_placement_review_fixture.png'), Buffer.from(ss2.data, 'base64'))
console.log('Saved 07_placement_review_fixture.png')

ws.close()
chromeProc.kill()
server.close()
console.log('Done capturing screenshots!')
process.exit(0)
