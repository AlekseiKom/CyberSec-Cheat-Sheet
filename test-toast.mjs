// CDP smoke-test: позиция тоста на десктопе и мобильном (без внешних зависимостей)
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const PORT = 9300 + Math.floor(Math.random() * 1000); // уникальный порт на запуск — защита от зомби-Chrome на старом порту
const PAGE = 'file:///' + path.join(process.cwd(), 'index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function waitForChrome(timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await httpGet(`http://127.0.0.1:${PORT}/json/version`);
      if (r.status === 200 && /Browser/.test(r.body)) return JSON.parse(r.body);
    } catch {}
    await sleep(300);
  }
  throw new Error('DevTools-эндпоинт Chrome не появился за ' + timeoutMs + ' мс');
}

class CDP {
  constructor(wsUrl) {
    const u = new URL(wsUrl);
    this.host = u.hostname;
    this.port = Number(u.port || 80);
    this.path = u.pathname + u.search;
    this.buf = Buffer.alloc(0);
    this.headerDone = false;
    this.pending = new Map();
    this.listeners = [];
    this.idSeq = 1;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const sock = net.connect(this.port, this.host);
      this.sock = sock;
      let settled = false;
      const fail = (e) => { if (!settled) { settled = true; reject(e); } };
      sock.once('error', (e) => { if (!this.headerDone) fail(e); else sock.destroy(); });
      sock.on('data', (chunk) => {
        this.buf = Buffer.concat([this.buf, chunk]);
        try {
          while (true) {
            if (!this.headerDone) {
              const i = this.buf.indexOf('\r\n\r\n');
              if (i < 0) break;
              const statusLine = this.buf.subarray(0, i).toString('latin1').split('\n')[0];
              if (!/ 101 /.test(' ' + statusLine)) { fail(new Error('WS handshake: ' + statusLine)); return; }
              this.headerDone = true;
              this.buf = this.buf.subarray(i + 4);
              settled = true;
              resolve();
              continue;
            }
            if (!this.readFrame()) break;
          }
        } catch (e) { fail(e); }
      });
      sock.once('connect', () => {
        sock.write(
          `GET ${this.path} HTTP/1.1\r\nHost: ${this.host}:${this.port}\r\n` +
          'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        );
      });
    });
  }

  readFrame() {
    if (this.buf.length < 2) return false;
    const opcode = this.buf[0] & 0x0f;
    let len = this.buf[1] & 0x7f;
    let off = 2;
    const masked = !!(this.buf[1] & 0x80);
    if (len === 126) {
      if (this.buf.length < 4) return false;
      len = this.buf.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (this.buf.length < 10) return false;
      len = Number(this.buf.readBigUInt64BE(2)); off = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (this.buf.length < off + maskLen + len) return false;
    const mk = masked ? this.buf.subarray(off, off + 4) : null;
    let payload = Buffer.from(this.buf.subarray(off + maskLen, off + maskLen + len));
    if (mk) for (let i = 0; i < payload.length; i++) payload[i] ^= mk[i & 3];
    this.buf = this.buf.subarray(off + maskLen + len);

    if (opcode === 8) { this.sock.end(); return false; } // close
    if (opcode === 9 && payload.length <= 125) { // ping → pong
      const head = Buffer.from([0x8a, payload.length | 0x80]);
      const m = crypto.randomBytes(4);
      const p = Buffer.from(payload);
      for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3];
      this.sock.write(Buffer.concat([head, m, p]));
      return true;
    }
    if (opcode === 1 || opcode === 2) {
      let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { return true; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result);
      } else {
        for (const fn of this.listeners) fn(msg);
      }
    }
    return true;
  }

  sendFrame(opcode, payloadBuf) {
    const masked = crypto.randomBytes(4);
    let head;
    if (payloadBuf.length < 126) head = Buffer.from([opcode | 0x80, payloadBuf.length | 0x80]);
    else if (payloadBuf.length < 65536) {
      head = Buffer.alloc(4); head[0] = opcode | 0x80; head[1] = 126 | 0x80; head.writeUInt16BE(payloadBuf.length, 2);
    } else {
      head = Buffer.alloc(9); head[0] = opcode | 0x80; head[1] = 127 | 0x80; head.writeBigUInt64BE(BigInt(payloadBuf.length), 1);
    }
    const p = Buffer.from(payloadBuf);
    for (let i = 0; i < p.length; i++) p[i] ^= masked[i & 3];
    this.sock.write(Buffer.concat([head, masked, p]));
  }

  send(method, params = {}) {
    const id = this.idSeq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout: ' + method)); } }, 15000);
      this.sendFrame(0x81, Buffer.from(JSON.stringify({ id, method, params }), 'utf8'));
    });
  }

  onEvent(fn) { this.listeners.push(fn); }

  close() { try { this.sock.end(); } catch {} }
}

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}

const MEASURE = `(() => {
    const t = document.getElementById('toast');
    // toast() живёт внутри IIFE script.js (не глобальный) — воспроизводим его действие:
    // ставим текст и снимаем .hidden (display:none !important); геометрия идентична реальному тосту
    t.textContent = 'CDP-проверка позиции тоста';
    t.classList.remove('hidden');
    const h = document.querySelector('.site-header');
    const r = t.getBoundingClientRect();
    const hr = h.getBoundingClientRect();
    const cs = getComputedStyle(t);
    let clusterRight = null;
    const he = document.querySelector('.header-end');
    if (he) clusterRight = he.getBoundingClientRect().right;
    // зазор считаем от layout-viewport (clientWidth), а не innerWidth:
    // position:fixed привязан к ICB, который НЕ включает вертикальный скроллбар
    const cw = document.documentElement.clientWidth;
    return {
      vw: innerWidth, clientW: cw, headerBottom: hr.bottom,
      toastTop: r.top, leftGap: r.left, rightGap: cw - r.right,
      width: r.width, height: r.height, pos: cs.position, transform: cs.transform,
      clusterRight, toastRight: r.right
    };
  })()`;

// evaluate с явной ошибкой: exceptionDetails в ответе = исключение внутри страницы
const evalJs = async (cdp, expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.exceptionDetails)
    throw new Error('ошибка evaluate в странице: ' + JSON.stringify(r.exceptionDetails));
  if ('value' in r.result || r.result.type === 'undefined') return r.result.value;
  throw new Error('evaluate без значения: ' + JSON.stringify(r));
};

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'csc-toast-test-' + Date.now())}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,900',
  PAGE,
], { stdio: 'ignore' });

let exitCode = 1;
try {
  const ver = await waitForChrome();
  console.log('browser:', ver.Browser);

  const list = JSON.parse((await httpGet(`http://127.0.0.1:${PORT}/json`)).body);
  const page = list.find((t) => t.type === 'page' && t.url.startsWith('file:///'));
  if (!page) throw new Error('не найден page-target с file:// URL');

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleErrors = [];
  const exceptions = [];
  cdp.onEvent((ev) => {
    if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error')
      consoleErrors.push(JSON.stringify(ev.params.args || []));
    else if (ev.method === 'Runtime.exceptionThrown')
      exceptions.push(String((ev.params.exceptionDetails?.exception?.description) || JSON.stringify(ev.params.exceptionDetails)));
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 15000) {
    const rs = await evalJs(cdp, 'document.readyState');
    if (rs === 'complete') { ready = true; break; }
    await sleep(250);
  }
  check('страница загружена (file://)', ready, `${Date.now() - t0} мс`);
  await sleep(400);

  // ---- ДЕСКТОП 1440x900: тост справа, под кластером кнопок шапки ----
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(350);
  const d = await evalJs(cdp, MEASURE);
  console.log('desktop  :', JSON.stringify(d));

  // ДИАГНОСТИКА позиционирования (вычисленные значения CSS) — только для отладки зазора
  const DIAG = `(() => {
    const h = document.getElementById('siteHeader');
    const t = document.getElementById('toast');
    const he = document.querySelector('.header-end');
    return JSON.stringify({
      headerPadRight: getComputedStyle(h).paddingRight,
      toastCsRight: getComputedStyle(t).right,
      bodyTransform: getComputedStyle(document.body).transform,
      htmlFilter: getComputedStyle(document.documentElement).filter,
      heRectRight: he ? +he.getBoundingClientRect().right.toFixed(2) : null,
      docScrollW: document.documentElement.scrollWidth,
    });
  })()`;
  const diag = await evalJs(cdp, DIAG);
  console.log('  [diag]', diag);

  check('D: position fixed', d.pos === 'fixed');
  check('D: под шапкой (+10px)', Math.abs(d.toastTop - (d.headerBottom + 10)) <= 1, `top=${d.toastTop.toFixed(1)}, headerBottom=${d.headerBottom.toFixed(1)}`);
  check('D: правый зазор = clamp(12,3vw,28)=28px', Math.abs(d.rightGap - 28) <= 1.5, `rightGap=${d.rightGap.toFixed(1)}px`);
  if (d.clusterRight != null)
    check('D: правый край = правому краю кластера кнопок', Math.abs(d.toastRight - d.clusterRight) <= 1, `toast=${d.toastRight.toFixed(1)}, cluster=${d.clusterRight.toFixed(1)}`);

  // ---- МОБИЛЬНЫЙ 390x844: тост по центру под однострочной шапкой ----
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(350);
  const m = await evalJs(cdp, MEASURE);
  console.log('mobile   :', JSON.stringify(m));
  check('M: position fixed', m.pos === 'fixed');
  check('M: под шапкой (+10px)', Math.abs(m.toastTop - (m.headerBottom + 10)) <= 1, `top=${m.toastTop.toFixed(1)}, headerBottom=${m.headerBottom.toFixed(1)}`);
  check('M: по центру (leftGap ≈ rightGap)', Math.abs(m.leftGap - m.rightGap) <= 1.5, `left=${m.leftGap.toFixed(1)}, right=${m.rightGap.toFixed(1)}`);
  check('M: не выходит за края (≥12px с обеих сторон)', m.leftGap >= 11 && m.rightGap >= 11, `width=${m.width.toFixed(0)}px`);
  // transform может прийти как translateX(-50%) или нормализованная matrix(1,0,0,1,-x,0)
  const isCenterTransform = /translate\(-?50%\)/.test(m.transform) ||
    /^matrix\(1,\s*0,\s*0,\s*1,\s*-[\d.]+,\s*0\)$/.test((m.transform || '').trim());
  check('M: transform = translateX(-50%) (или эквивалентная matrix)', isCenterTransform, m.transform || '(none)');

  // ---- ошибки консоли/исключения (за всё время теста) ----
  const errCount = consoleErrors.length + exceptions.length;
  check('нет ошибок консоли и исключений', errCount === 0, errCount ? `${errCount}: ${[...consoleErrors, ...exceptions].join(' | ')}` : '0');

  cdp.close();
  exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error('FATAL:', e.message);
  exitCode = 2;
} finally {
  chrome.kill();
}

console.log(failures === 0 ? '\nALL PASS' : `\nFAILURES: ${failures}`);
process.exit(exitCode);
