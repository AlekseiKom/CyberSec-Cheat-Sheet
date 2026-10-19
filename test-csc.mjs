// Headless Chrome CDP test for CyberSec-Cheat-Sheet/index.html
// Запуск: node --experimental-websocket test-csc.mjs  (флаг обязателен на Node < 22)
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'file:///C:/Users/Lep4i/Desktop/My%20GitHub/CyberSec-Cheat-Sheet/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
    target = list.find((t) => t.type === 'page');
  } catch {}
}
if (!target) { console.error('Chrome devtools not reachable'); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errors = [];
function send(method, params = {}) {
  return new Promise((res, rej) => { const m = { id: ++id, method, params }; pending.set(id, { res, rej }); ws.send(JSON.stringify(m)); });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXC: ' + ((msg.params.exceptionDetails?.exception?.description) || msg.params.exceptionDetails?.text || '').slice(0, 250));
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 250));
  }
};
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(1800);

const results = [];
const ok = (name, cond, detail = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}

// S1 theme toggle
ok('initial theme dark', await ev(`document.documentElement.dataset.theme==='dark'`));
await ev(`document.querySelector('#themeBtn').click(); 1`);
ok('toggle to light + persisted', await ev(`document.documentElement.dataset.theme==='light' && localStorage.getItem('csc-theme')==='light'`));
await ev(`document.querySelector('#themeBtn').click(); 1`);
ok('back to dark', await ev(`document.documentElement.dataset.theme==='dark'`));

// S2 search filter
const total = await ev(`document.querySelectorAll('.cmd-card').length`);
await ev(`(()=>{const i=document.querySelector('#searchInput'); i.value='chmod'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
await sleep(300);
const visAfterSearch = await ev(`[...document.querySelectorAll('.cmd-card')].filter(c=>!c.classList.contains('hidden')).length`);
ok('search "chmod" filters cards', visAfterSearch < total && !await ev(`document.querySelector('#cmd-chmod').classList.contains('hidden')`), `visible=${visAfterSearch}/${total}`);
await ev(`(()=>{const i=document.querySelector('#searchInput'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
await sleep(300);
ok('clear search restores all', await ev(`[...document.querySelectorAll('.cmd-card')].filter(c=>c.classList.contains('hidden')).length===0`));

// S3 add favorite + toast
await ev(`(()=>{const b=document.querySelector('#cmd-ls .act-fav'); b.click(); return 1;})()`);
ok('toast on add', await ev(`!document.querySelector('#toast').classList.contains('hidden') && document.querySelector('#toast').textContent.includes('Добавлено')`));
ok('fav button active (.on)', await ev(`document.querySelector('#cmd-ls .act-fav').classList.contains('on')`));

// S4 modal open with 1 item
await ev(`document.querySelector('#favBtn').click(); 1`);
ok('modal opens, 1 fav-item', await ev(`!document.querySelector('#favModal').classList.contains('hidden') && document.querySelectorAll('#favList .fav-item').length===1`));

// S5 remove from modal -> empty state
await ev(`(()=>{const rm=document.querySelector('#favList .act-fav'); rm.click(); return 1;})()`);
ok('empty state after remove', await ev(`document.querySelector('#favList .empty')!==null && document.querySelector('#favList').textContent.includes('Пока пусто')`));

// S6 close modal via X
await ev(`document.querySelector('#favClose').click(); 1`);
ok('modal closes via #favClose', await ev(`document.querySelector('#favModal').classList.contains('hidden')`));

// S7 toast auto-hide
await sleep(2500);
ok('toast auto-hides', await ev(`document.querySelector('#toast').classList.contains('hidden')`));

// S8 mobile burger menu
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 800, deviceScaleFactor: 1, mobile: true });
await sleep(300);
await ev(`document.querySelector('#burgerBtn').click(); 1`);
ok('sidenav opens + overlay shows', await ev(`document.querySelector('#sidenav').classList.contains('open') && document.querySelector('#navOverlay').classList.contains('show')`));
await ev(`document.querySelector('#navOverlay').click(); 1`);
ok('overlay click closes sidenav', await ev(`!document.querySelector('#sidenav').classList.contains('open') && !document.querySelector('#navOverlay').classList.contains('show')`));

// S9 hint chips
const chips = await ev(`document.querySelectorAll('.hint-chip').length`);
ok('5 hint chips present', chips === 5, `found=${chips}`);
await ev(`(()=>{const c=document.querySelector('.hint-chip'); c.click(); return 1;})()`);
const chipVal = await ev(`document.querySelector('#termInput').value`);
ok('chip click fills terminal input', chipVal === 'ls -la', `val="${chipVal}"`);

// S10 sandbox: ls then clear (exec via keydown Enter on #termInput)
const enter = `(()=>{const i=document.querySelector('#termInput'); i.value='CMD'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 1;})()`;
await ev(enter.replace(/CMD/g, 'ls'));
await sleep(300);
ok('sandbox "ls" echoes command + output', await ev(`document.querySelector('#termBody').textContent.includes('$ ls') && document.querySelector('#termInput').value===''`));
await ev(enter.replace(/CMD/g, 'clear'));
await sleep(300);
ok('sandbox "clear" empties output', await ev(`document.querySelector('#termBody').textContent.trim().length===0`));

// S11 copy button -> toast (clipboard or fallback)
await ev(`(()=>{const b=document.querySelector('#cmd-ls .act-copy'); if(b) b.click(); return !!b;})()`);
await sleep(400);
ok('copy shows toast', await ev(`!document.querySelector('#toast').classList.contains('hidden')`), `msg="${await ev(`document.querySelector('#toast').textContent`)}"`);

// S12 export with empty favorites -> "Избранное пусто"
await ev(`(()=>{const b=[...document.querySelectorAll('#favModal button')].find(x=>/txt/i.test((x.textContent||'')+(x.title||''))); if(b){ document.querySelector('#favBtn').click(); b.click(); } return !!b;})()`);
await sleep(400);
ok('export empty favs -> toast', await ev(`document.querySelector('#toast').textContent.includes('Избранное пусто')`));

// S13 no JS errors
ok('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
ws.close(); chrome.kill(); process.exit(failed ? 1 : 0);