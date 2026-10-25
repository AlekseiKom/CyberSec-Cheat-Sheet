import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///C:/Users/Lep4i/Desktop/My%20GitHub/CyberSec-Cheat-Sheet/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws; const pending = new Map(); let idc = 1;
function send(method, params = {}) { return new Promise((res, rej) => { const id = idc++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); }); }

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=9232`, 'about:blank'], { stdio: 'ignore' });
let pageWsUrl;
for (let i = 0; i < 50 && !pageWsUrl; i++) {
  try {
    const r = await fetch('http://127.0.0.1:9232/json/new?' + encodeURIComponent(URL), { method: 'PUT' });
    if (r.ok) pageWsUrl = (await r.json()).webSocketDebuggerUrl;
    else { const g = await fetch('http://127.0.0.1:9232/json/new?' + encodeURIComponent(URL)); if (g.ok) pageWsUrl = (await g.json()).webSocketDebuggerUrl; }
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

// 1. Проверка мобильного скролла на узком экране (375x667 iPhone SE)
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
await sleep(300);

// Проверяем отсутствие горизонтального оверфлоу документа
const docScrollWidth = await ev(`document.documentElement.scrollWidth`);
const bodyScrollWidth = await ev(`document.body.scrollWidth`);
const winWidth = await ev(`window.innerWidth`);
const over = await ev(`(() => {
  const list = [];
  document.querySelectorAll('#sandbox *').forEach(el => {
    if (el.scrollWidth > 351 || el.clientWidth > 351 || el.offsetWidth > 351) {
      list.push({ tag: el.tagName, id: el.id, class: el.className, text: el.textContent.slice(0, 30), sw: el.scrollWidth, cw: el.clientWidth, ow: el.offsetWidth });
    }
  });
  return JSON.stringify(list);
})()`);
console.log('Overflowing sandbox children:', over);
ok('mobile: no document horizontal overflow (doc: ' + docScrollWidth + ', win: ' + winWidth + ')', docScrollWidth <= winWidth + 1);
ok('mobile: no body horizontal overflow (body: ' + bodyScrollWidth + ', win: ' + winWidth + ')', bodyScrollWidth <= winWidth + 1);

// Проверяем вертикальный скролл страницы на мобилке
await ev(`window.scrollTo({ top: 500, behavior: 'instant' }); 1`);
await sleep(200);
const scrollYAfter = await ev(`window.scrollY`);
ok('mobile: vertical scroll functions smoothly (scrollY=' + scrollYAfter + ')', scrollYAfter >= 490);
await ev(`window.scrollTo({ top: 0, behavior: 'instant' }); 1`);
await sleep(200);

// 2. Проверка невидимости и ненавязчивости оверлея при закрытом меню
const overlayPointerEvents = await ev(`getComputedStyle(document.querySelector('#navOverlay')).pointerEvents`);
const overlayVisibility = await ev(`getComputedStyle(document.querySelector('#navOverlay')).visibility`);
ok('overlay pointer-events is none when inactive', overlayPointerEvents === 'none');
ok('overlay visibility is hidden when inactive', overlayVisibility === 'hidden');

// 3. Проверка мобильного sidenav: visibility hidden и pointer-events none в закрытом состоянии
const sidenavPointerEvents = await ev(`getComputedStyle(document.querySelector('#sidenav')).pointerEvents`);
const sidenavVisibility = await ev(`getComputedStyle(document.querySelector('#sidenav')).visibility`);
ok('sidenav pointer-events is none when closed', sidenavPointerEvents === 'none');
ok('sidenav visibility is hidden when closed', sidenavVisibility === 'hidden');

// 4. Проверка работы кнопок категорий (.cat-tab)
// Клик по «Web / OWASP»
await ev(`document.querySelector('.cat-tab[data-cat="web"]').click(); 1`);
await sleep(300);
const howtoHiddenOnWeb = await ev(`document.querySelector('#howto').classList.contains('hidden')`);
const attackVisibleOnWeb = await ev(`!document.querySelector('#attack').classList.contains('hidden')`);
const activeTabWeb = await ev(`document.querySelector('.cat-tab[data-cat="web"]').classList.contains('active')`);
const filterChipShown = await ev(`document.querySelector('#filterChip').classList.contains('show')`);
ok('clicking Web tab hides #howto', howtoHiddenOnWeb);
ok('clicking Web tab shows #attack', attackVisibleOnWeb);
ok('Web tab has .active class', activeTabWeb);
ok('filter chip displays #web', filterChipShown);

// Клик по «Все разделы» (data-cat="all")
await ev(`document.querySelector('.cat-tab[data-cat="all"]').click(); 1`);
await sleep(300);
const howtoVisibleOnAll = await ev(`!document.querySelector('#howto').classList.contains('hidden')`);
const allTabActive = await ev(`document.querySelector('.cat-tab[data-cat="all"]').classList.contains('active')`);
ok('clicking All tab restores #howto', howtoVisibleOnAll);
ok('All tab has .active class', allTabActive);

// 5. Проверка кнопок RHOST/LHOST и Сброс (#btnResetIp)
await ev(`(() => {
  document.querySelector('#inputRhost').value = '192.168.1.50';
  document.querySelector('#inputRhost').dispatchEvent(new Event('input'));
  document.querySelector('#inputLhost').value = '192.168.1.99';
  document.querySelector('#inputLhost').dispatchEvent(new Event('input'));
  return 1;
})()`);
const phRhostVal = await ev(`document.querySelector('.ph-rhost').textContent`);
const phLhostVal = await ev(`document.querySelector('.ph-lhost').textContent`);
ok('inputs update ph-rhost span', phRhostVal === '192.168.1.50');
ok('inputs update ph-lhost span', phLhostVal === '192.168.1.99');

// Клик по кнопке «Сброс» (#btnResetIp)
await ev(`document.querySelector('#btnResetIp').click(); 1`);
await sleep(200);
const rhostAfterReset = await ev(`document.querySelector('#inputRhost').value`);
const phRhostAfterReset = await ev(`document.querySelector('.ph-rhost').textContent`);
const toastMsg = await ev(`document.querySelector('#toast').textContent`);
ok('#btnResetIp clears input value', rhostAfterReset === '');
ok('#btnResetIp restores default ph-rhost (10.10.10.1)', phRhostAfterReset === '10.10.10.1');
ok('#btnResetIp triggers descriptive toast', toastMsg.includes('IP сброшены'));

// 6. Проверка кнопки «Компактно» (#btnCompactMode)
await ev(`document.querySelector('#btnCompactMode').click(); 1`);
await sleep(200);
const isCompact = await ev(`document.body.classList.contains('compact-mode')`);
const compactAria = await ev(`document.querySelector('#btnCompactMode').getAttribute('aria-pressed')`);
ok('#btnCompactMode adds body.compact-mode', isCompact);
ok('#btnCompactMode sets aria-pressed="true"', compactAria === 'true');
await ev(`document.querySelector('#btnCompactMode').click(); 1`); // toggle back

// 7. Проверка якорных ссылок из глоссария при активном фильтре
await ev(`document.querySelector('.cat-tab[data-cat="linux"]').click(); 1`); // включили linux-фильтр
await sleep(200);
// Клик по ссылке на #cmd-ssrf (из web)
await ev(`(() => {
  const link = document.querySelector('a[href="#cmd-ssrf"]');
  if (link) link.click();
  return !!link;
})()`);
await sleep(300);
const cmdSsrfVisible = await ev(`!document.querySelector('#cmd-ssrf').classList.contains('hidden')`);
ok('clicking internal anchor link unhides target card', cmdSsrfVisible);

ok('total JS uncaught errors: 0', jsErrors === 0);

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
chrome.kill();
process.exit(failed > 0 ? 1 : 0);
