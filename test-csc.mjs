// Headless Chrome CDP-тесты для CyberSec-Cheat-Sheet/index.html
// Запуск: node --experimental-websocket test-csc.mjs  (флаг нужен на Node < 22)
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///C:/Users/Lep4i/Desktop/My%20GitHub/CyberSec-Cheat-Sheet/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws; const pending = new Map(); let idc = 1;
function send(method, params = {}) { return new Promise((res, rej) => { const id = idc++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); }); }

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=9231`, 'about:blank'], { stdio: 'ignore' });
let pageWsUrl;
for (let i = 0; i < 50 && !pageWsUrl; i++) {
  try {
    const r = await fetch('http://127.0.0.1:9231/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
    if (r.ok) pageWsUrl = (await r.json()).webSocketDebuggerUrl;
    else { const g = await fetch('http://127.0.0.1:9231/json/new?' + encodeURIComponent(URL)); if (g.ok) pageWsUrl = (await g.json()).webSocketDebuggerUrl; }
  } catch (e) { await sleep(400); }
}
if (!pageWsUrl) { console.error('Chrome CDP not available'); process.exit(1); }

ws = new WebSocket(pageWsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let jsErrors = 0, pageLoaded = false;
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
  else if (d.method === 'Runtime.exceptionThrown') jsErrors++;
  else if (d.method === 'Page.loadEventFired') pageLoaded = true;
};

const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
let passed = 0, failed = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); cond ? passed++ : failed++; };

await send('Runtime.enable');
await send('Page.enable');
for (let i = 0; i < 50 && !pageLoaded; i++) await sleep(200);

// S1 — иконка темы: переключение + персистентность
ok('initial theme dark', await ev(`document.documentElement.dataset.theme === 'dark'`));
await ev(`document.querySelector('#themeBtn').click(); 1`);
ok('toggle to light + persisted', await ev(`document.documentElement.dataset.theme === 'light' && localStorage.getItem('csc-theme') === 'light'`));
await ev(`document.querySelector('#themeBtn').click(); 1`);
ok('back to dark', await ev(`document.documentElement.dataset.theme === 'dark'`));

// S2 — поиск фильтрует разделы: «nmap» → видны только блоки с nmap
const initialVisible = await ev(`[...document.querySelectorAll('.block')].filter(s => s.offsetWidth > 0).length`);
await ev(`(() => { const i = document.querySelector('#searchInput'); i.value = 'nmap'; i.dispatchEvent(new Event('input')); return 1; })()`);
await sleep(300);
const visibleAfter = await ev(`[...document.querySelectorAll('.block')].filter(s => s.offsetWidth > 0).length`);
ok(`search "nmap" filters (${initialVisible} → ${visibleAfter})`, initialVisible >= 8 && visibleAfter < initialVisible && visibleAfter > 0);
await ev(`(() => { const i = document.querySelector('#searchInput'); i.value = ''; i.dispatchEvent(new Event('input')); return 1; })()`);

// S3 — избранное полностью удалено: кнопки, модалка, звёзды карточек, ключ в localStorage
ok('no #favBtn / #favModal / .act-fav', await ev(`!document.querySelector('#favBtn') && !document.querySelector('#favModal') && document.querySelectorAll('.act-fav').length === 0`));
ok('csc-favorites not in localStorage', await ev(`localStorage.getItem('csc-favorites') === null`));

// S4 — иконка темы на старом месте избранного (правый кластер, сразу перед бургером)
ok('#themeBtn sits right before #burgerBtn', await ev(`document.querySelector('#burgerBtn').previousElementSibling === document.querySelector('#themeBtn')`));

// S5 — кнопка копирования → тост
await ev(`(() => { const b = document.querySelector('#cmd-ls .act-copy'); if (b) b.click(); return !!b; })()`);
await sleep(400);
ok('copy shows toast', await ev(`!document.querySelector('#toast').classList.contains('hidden')`));

// S6 — тост сам скрывается через ~2 c
await sleep(2500);
ok('toast auto-hides', await ev(`document.querySelector('#toast').classList.contains('hidden')`));

// S7 — мобильное бургер-меню: открыть → оверлей, закрыть → скрыт (только при узком окне)
const w = await ev(`window.innerWidth`);
if (w < 1160) {
  await ev(`document.querySelector('#burgerBtn').click(); 1`);
  ok('mobile: sidenav opens + overlay', await ev(`document.querySelector('#sidenav').classList.contains('open') && document.querySelector('#navOverlay').classList.contains('show')`));
  await ev(`document.querySelector('#burgerBtn').click(); 1`);
  ok('mobile: sidenav closes', await ev(`!document.querySelector('#sidenav').classList.contains('open')`));
} else console.log('SKIP — mobile burger (desktop width ' + w + ')');

// S8 — hint-chips: количество + клик подставляет команду в терминал
const chipCount = await ev(`document.querySelectorAll('.hint-chip').length`);
ok(`hint chips present (${chipCount})`, chipCount === 5);
await ev(`document.querySelector('.hint-chip').click(); 1`);
ok('chip fills terminal input', (await ev(`document.querySelector('#termInput').value`)).length > 0);

// S9 — песочница: ls → список файлов, clear → пусто
const out = await ev(`(() => { const i = document.querySelector('#termInput'); i.value = 'ls'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); return document.querySelector('#termBody').textContent; })()`);
ok('sandbox ls lists files', /notes\.txt|ssh/.test(out));
await ev(`(() => { const i = document.querySelector('#termInput'); i.value = 'clear'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); return 1; })()`);
ok('sandbox clear empties output', (await ev(`document.querySelector('#termBody').textContent.trim().length`)) === 0);

// S12 — мобильная кнопка поиска (≤720px): скрыта на десктопе, панель открывается/закрывается, Esc, клик вне, бургер
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(400);
ok('search button hidden at >720px', await ev(`getComputedStyle(document.querySelector('#mobileSearchBtn')).display === 'none'`));
await ev(`(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); return 1; })()`); /* сброс фокуса: после S8/S9 он в #termInput, а «/» внутри полей не перехватывается */
await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); 1`);
await sleep(250);
ok('/ hotkey: no panel on desktop, focus in search input', await ev(`!document.getElementById('siteHeader').classList.contains('search-open') && document.activeElement === document.querySelector('#searchInput')`));

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 2, mobile: false });
await sleep(500);
ok('at ≤720px button visible and immediately left of theme button', await ev(`(() => { const b = document.querySelector('#mobileSearchBtn'); return getComputedStyle(b).display !== 'none' && b.nextElementSibling === document.getElementById('themeBtn'); })()`));
ok('search button sits visually right next to theme button (no auto-margin gap)', await ev(`(() => { const r1 = document.querySelector('#mobileSearchBtn').getBoundingClientRect(); const r2 = document.getElementById('themeBtn').getBoundingClientRect(); return Math.abs((r2.left - r1.right) - 14) <= 6; })()`));

await ev(`document.querySelector('#mobileSearchBtn').click(); 1`);
await sleep(500);
ok('panel opens: search-open, aria-expanded=true, max-height expanded', await ev(`(() => { const h = document.getElementById('siteHeader'), b = document.querySelector('#mobileSearchBtn'); return h.classList.contains('search-open') && b.getAttribute('aria-expanded') === 'true' && getComputedStyle(document.querySelector('.search-wrap')).maxHeight === '96px'; })()`));
ok('focus moved to search input on open', await ev(`document.activeElement === document.querySelector('#searchInput')`));

const totalBlocks = await ev(`[...document.querySelectorAll('.block')].length`);
await ev(`(() => { const i = document.querySelector('#searchInput'); i.value = 'nmap'; i.dispatchEvent(new Event('input')); return 1; })()`);
await sleep(350);
ok('typing in mobile panel filters sections', await ev(`[...document.querySelectorAll('.block')].filter(s => s.offsetWidth > 0).length < ${totalBlocks}`));

/* blur field → Esc outside closes the panel (query preserved) */
await ev(`document.querySelector('#searchInput').blur(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
await sleep(500);
ok('Esc outside input closes mobile panel, query preserved', await ev(`(() => { const h = document.getElementById('siteHeader'), i = document.querySelector('#searchInput'); return !h.classList.contains('search-open') && getComputedStyle(document.querySelector('.search-wrap')).visibility === 'hidden' && i.value === 'nmap'; })()`));

/* reopen → Esc while focused in input: clears text, blurs, but panel stays open */
await ev(`document.querySelector('#mobileSearchBtn').click(); 1`);
await sleep(500);
ok('reopen: focus back in input', await ev(`document.activeElement === document.querySelector('#searchInput') && document.getElementById('siteHeader').classList.contains('search-open')`));
await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
await sleep(350);
ok('Esc in input clears text and blurs, panel stays open, filters reset', await ev(`(() => { const i = document.querySelector('#searchInput'); return i.value === '' && document.activeElement !== i && document.getElementById('siteHeader').classList.contains('search-open') && [...document.querySelectorAll('.block')].filter(s => s.offsetWidth > 0).length >= ${totalBlocks}; })()`));

/* outside click closes the panel */
await ev(`(() => { const t = document.createElement('div'); t.style.cssText = 'position:fixed;left:10px;top:200px;width:40px;height:40px;background:red;z-index:5'; document.body.appendChild(t); t.click(); t.remove(); return 1; })()`);
await sleep(500);
ok('click outside closes mobile panel', await ev(`!document.getElementById('siteHeader').classList.contains('search-open') && document.querySelector('#mobileSearchBtn').getAttribute('aria-expanded') === 'false'`));

/* burger opening the menu simultaneously closes the search panel */
await ev(`document.querySelector('#mobileSearchBtn').click(); 1`);
await sleep(500);
ok('panel open before burger', await ev(`document.getElementById('siteHeader').classList.contains('search-open')`));
await ev(`document.querySelector('#burgerBtn').click(); 1`);
await sleep(400);
ok('burger opens menu and closes search panel', await ev(`document.querySelector('#sidenav').classList.contains('open') && !document.getElementById('siteHeader').classList.contains('search-open')`));
await ev(`document.querySelector('#burgerBtn').click(); 1`);
await sleep(300);
ok('menu closed, search stays closed', await ev(`!document.querySelector('#sidenav').classList.contains('open') && !document.getElementById('siteHeader').classList.contains('search-open')`));

await send('Emulation.clearDeviceMetricsOverride');
await sleep(400);

// S10 — нет JS-ошибок на странице
ok('no uncaught JS errors', jsErrors === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
ws.close(); chrome.kill();
process.exit(failed ? 1 : 0);