    'use strict';
    /* utils */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.add('hidden'), 1800); }

    /* theme */
    const themeBtn = $('#themeBtn'), iconMoon = $('#iconMoon'), iconSun = $('#iconSun');
    function applyTheme(t) { document.documentElement.dataset.theme = t; iconMoon.style.display = t === 'dark' ? '' : 'none'; iconSun.style.display = t === 'light' ? '' : 'none'; }
    applyTheme(localStorage.getItem('csc-theme') || 'dark');
    themeBtn.addEventListener('click', () => { const cur = document.documentElement.dataset.theme; const next = cur === 'dark' ? 'light' : 'dark'; localStorage.setItem('csc-theme', next); applyTheme(next); });

    /* card action buttons */
    function renderCardButtons() {
      $$('.cmd-card').forEach(card => {
        const head = $('.cmd-head', card);
        let bar = head ? $('.card-actions', head) : null;
        if (!bar) {
          bar = document.createElement('div'); bar.className = 'card-actions';
          const mk = (cls, title, svg) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn ' + cls; b.title = title; b.innerHTML = svg; return b; };
          bar.appendChild(mk('act-copy', 'Копировать команду', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'));
          bar.appendChild(mk('act-link', 'Скопировать ссылку на блок', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></svg>'));
          (head || card).appendChild(bar);
        }
      });
    }

    document.addEventListener('click', e => {
      const btn = e.target.closest('.card-actions button');
      if (!btn) return;
      const card = btn.closest('.cmd-card');
      if (!card) return;
      if (btn.classList.contains('act-copy')) {
        const pre = $('pre.code', card);
        if (pre) {
          copyText(pre.textContent.trim(), 'Скопировано!');
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1200);
        }
      } else if (btn.classList.contains('act-link')) {
        const url = location.origin + location.pathname + '#' + card.id;
        copyText(url, 'Ссылка скопирована!');
        history.replaceState(null, '', '#' + card.id);
      }
    });

    function copyText(text, msg) {
      if (navigator.clipboard && window.isSecureContext !== false) {
        navigator.clipboard.writeText(text).then(() => toast(msg), () => fallbackCopy(text, msg));
      } else fallbackCopy(text, msg);
    }
    function fallbackCopy(text, msg) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg); } catch (e) { toast('Не удалось скопировать'); }
      ta.remove();
    }

    /* search + tag filter */
    const searchInput = $('#searchInput'), searchStatus = $('#searchStatus'), filterChip = $('#filterChip');
    let activeTag = null, query = '';

    function applyFilters() {
      const q = query.trim().toLowerCase();
      let visible = 0;
      $$('.block').forEach(sec => {
        let secVisible = false;
        $$(':scope > .card, :scope > article', sec).forEach(card => {
          if (!card.matches('.cmd-card')) return; // обычные карточки всегда видны
          const hay = (card.textContent + ' ' + (card.dataset.tags || '')).toLowerCase();
          const okQ = !q || hay.includes(q);
          const okT = !activeTag || (card.dataset.tags || '').split(/\s+/).includes(activeTag);
          const show = okQ && okT;
          card.classList.toggle('hidden', !show);
          if (show) secVisible = true;
        });
        if ($$('.cmd-card', sec).length === 0) {
          if (q) {
            secVisible = sec.textContent.toLowerCase().includes(q);
          } else {
            // Если выбран тег/категория — вводные секции без карточек команд скрываются, чтобы сразу был виден нужный блок
            secVisible = !activeTag;
          }
        } else if (q && !secVisible) {
          const headText = (sec.querySelector('.sec-head') ? sec.querySelector('.sec-head').textContent : '').toLowerCase();
          if (headText.includes(q)) secVisible = true;
        }
        sec.classList.toggle('hidden', !secVisible);
        if (secVisible) visible++;
      });
      searchStatus.textContent = q ? ('Секций: ' + visible) : (activeTag ? ('#' + activeTag) : '');
    }

    const CAT_TARGETS = {
      'linux': '#linux',
      'recon': '#recon',
      'web': '#cmd-sqli',
      'ad': '#cmd-ad-bloodhound',
      'privesc': '#privesc',
      'defense': '#defense',
      'oneliners': '#oneliners'
    };

    function filterByTag(tag, shouldScroll = false) {
      activeTag = (activeTag === tag) ? null : tag;
      filterChip.textContent = activeTag ? ('#' + activeTag + ' ×') : '';
      filterChip.classList.toggle('show', !!activeTag);
      syncCategoryTabs();
      applyFilters();

      if (activeTag && shouldScroll) {
        const targetSelector = CAT_TARGETS[activeTag] || ('#' + activeTag);
        const targetEl = document.querySelector(targetSelector) || document.querySelector('#attack');
        if (targetEl) {
          setTimeout(() => {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 30);
        }
      }
    }

    function syncCategoryTabs() {
      const tabs = $$('.cat-tab');
      if (!tabs.length) return;
      tabs.forEach(t => {
        const isAct = (!activeTag && t.dataset.cat === 'all') || (activeTag && t.dataset.cat === activeTag);
        t.classList.toggle('active', !!isAct);
        if (isAct && typeof t.scrollIntoView === 'function') {
          t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    }

    searchInput.addEventListener('input', () => { query = searchInput.value; applyFilters(); });
    document.addEventListener('click', e => {
      const tag = e.target.closest('.tag-link');
      if (!tag) return;
      e.preventDefault();
      filterByTag(tag.dataset.tag, true);
    });
    filterChip.addEventListener('click', () => {
      activeTag = null;
      filterChip.textContent = '';
      filterChip.classList.remove('show');
      syncCategoryTabs();
      applyFilters();
    });

    /* Category tabs */
    $$('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const cat = tab.dataset.cat;
        if (cat === 'all') {
          activeTag = null;
          filterChip.textContent = '';
          filterChip.classList.remove('show');
          syncCategoryTabs();
          applyFilters();
          const qtb = $('#quickToolbar');
          if (qtb) qtb.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (cat === 'oneliners') {
          activeTag = null;
          filterChip.textContent = '';
          filterChip.classList.remove('show');
          syncCategoryTabs();
          applyFilters();
          const sec = $('#oneliners');
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          filterByTag(cat, true);
        }
      });
    });

    /* Авто-раскрытие скрытых секций при переходе по внутренним якорным ссылкам */
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href === '#' || href.length < 2) return;
      try {
        const target = document.querySelector(href);
        if (target && (target.classList.contains('hidden') || target.closest('.hidden'))) {
          activeTag = null;
          query = '';
          searchInput.value = '';
          filterChip.textContent = '';
          filterChip.classList.remove('show');
          syncCategoryTabs();
          applyFilters();
        }
      } catch (err) { /* ignore invalid selectors */ }
    });

    /* Dynamic RHOST / LHOST IP replacement across code cards */
    const inputRhost = $('#inputRhost'), inputLhost = $('#inputLhost'), btnResetIp = $('#btnResetIp');
    function updateDynamicIps() {
      const rhost = (inputRhost && inputRhost.value.trim()) || '10.10.10.1';
      const lhost = (inputLhost && inputLhost.value.trim()) || '10.10.14.2';
      $$('.ph-rhost').forEach(el => el.textContent = rhost);
      $$('.ph-lhost').forEach(el => el.textContent = lhost);
      if (inputRhost) localStorage.setItem('csc-rhost', inputRhost.value.trim());
      if (inputLhost) localStorage.setItem('csc-lhost', inputLhost.value.trim());
    }
    if (inputRhost) {
      inputRhost.value = localStorage.getItem('csc-rhost') || '';
      inputRhost.addEventListener('input', updateDynamicIps);
    }
    if (inputLhost) {
      inputLhost.value = localStorage.getItem('csc-lhost') || '';
      inputLhost.addEventListener('input', updateDynamicIps);
    }
    if (btnResetIp) {
      btnResetIp.addEventListener('click', () => {
        if (inputRhost) inputRhost.value = '';
        if (inputLhost) inputLhost.value = '';
        localStorage.removeItem('csc-rhost');
        localStorage.removeItem('csc-lhost');
        updateDynamicIps();
        btnResetIp.classList.add('active');
        setTimeout(() => btnResetIp.classList.remove('active'), 500);
        toast('IP сброшены (RHOST: 10.10.10.1, LHOST: 10.10.14.2)');
      });
    }

    /* Compact mode toggle */
    const btnCompactMode = $('#btnCompactMode');
    function setCompactMode(active) {
      document.body.classList.toggle('compact-mode', active);
      if (btnCompactMode) {
        btnCompactMode.classList.toggle('active', active);
        btnCompactMode.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      localStorage.setItem('csc-compact', active ? '1' : '0');
    }
    if (localStorage.getItem('csc-compact') === '1') setCompactMode(true);
    if (btnCompactMode) {
      btnCompactMode.addEventListener('click', () => {
        const next = !document.body.classList.contains('compact-mode');
        setCompactMode(next);
        toast(next ? 'Компактный режим (только команды)' : 'Обычный режим (с описаниями)');
      });
    }

    /* ===== мобильная поисковая панель (≤720px) — поведение как в Network-Project, стилизация токенами CyberSec ===== */
    const siteHeader = document.getElementById('siteHeader');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');

    function openMobileSearchPanel() {
      if (!isMobileViewport()) { searchInput.focus(); searchInput.select(); return; } /* десктоп: поле видно на месте */
      siteHeader.classList.add('search-open');
      mobileSearchBtn.setAttribute('aria-expanded', 'true');
      searchInput.focus({ preventScroll: true });
    }

    function closeMobileSearchPanel() {
      if (!siteHeader.classList.contains('search-open')) return;
      siteHeader.classList.remove('search-open');
      mobileSearchBtn.setAttribute('aria-expanded', 'false');
    }

    const isMobileViewport = () => window.innerWidth <= 720;

    mobileSearchBtn.addEventListener('click', () => {
      if (siteHeader.classList.contains('search-open')) closeMobileSearchPanel(); else openMobileSearchPanel(); /* toggle */
    });

    document.addEventListener('click', e => {
      const hdr = document.getElementById('siteHeader');
      if (!hdr.classList.contains('search-open')) return;
      if (e.target.closest('#mobileSearchBtn') || e.target.closest('.search-wrap')) return;
      closeMobileSearchPanel(); /* клик вне кнопки/панели — закрыть мобильный поиск */
    });

    window.addEventListener('resize', () => {
      if (!isMobileViewport()) closeMobileSearchPanel(); /* на десктопной ширине панель бессмысленна */
      if (window.innerWidth > 1160) closeNav(); /* при переходе на десктоп закрыть мобильную шторку */
    });

    /* hotkeys */
    document.addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA/.test((document.activeElement ? document.activeElement.tagName : ''));
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault(); openMobileSearchPanel(); /* ≤720px: сначала открыть панель, затем сфокусировать поле */
      }
      if (e.key === 'Escape') {
        const hdr = document.getElementById('siteHeader');
        if (hdr.classList.contains('search-open') && document.activeElement !== searchInput) {
          closeMobileSearchPanel(); /* Esc вне поля — закрыть мобильную панель (запрос сохраняется) */
          return;
        }
        searchInput.value = ''; query = ''; applyFilters(); searchInput.blur();
      }
    });

    /* scrollspy */
    const navLinks = $$('.nav-link');
    function onScroll() {
      const y = window.scrollY + 140; let current = null;
      $$('.block').forEach(sec => { if (sec.offsetTop <= y) current = sec.id; });
      navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + current));
    }
    let scrollTm = null;
    window.addEventListener('scroll', () => { if (scrollTm) return; scrollTm = setTimeout(() => { onScroll(); scrollTm = null; }, 80); });

    /* burger menu (mobile sidenav) */
    const sidenav = $('#sidenav'), navOverlay = $('#navOverlay');
    function closeNav() { sidenav.classList.remove('open'); navOverlay.classList.remove('show'); }
    $('#burgerBtn').addEventListener('click', () => {
      if (!sidenav.classList.contains('open')) closeMobileSearchPanel(); /* при открытии меню закрыть мобильный поиск */
      const open = sidenav.classList.toggle('open'); navOverlay.classList.toggle('show', open);
    });
    navOverlay.addEventListener('click', closeNav);
    navLinks.forEach(l => l.addEventListener('click', closeNav));

    /* sandbox: fake filesystem */
    const FS = {
      '/': ['etc', 'var', 'home', 'tmp', 'bin'],
      '/etc': ['passwd', 'shadow', 'ssh'],
      '/etc/ssh': ['sshd_config'],
      '/var': ['log', 'www'],
      '/var/log': ['auth.log', 'syslog'],
      '/var/www': ['html'],
      '/var/www/html': ['index.html', 'panel.php'],
      '/home': ['user'],
      '/home/user': ['.ssh', '.secret_flag', 'notes.txt'],
      '/home/user/.ssh': ['authorized_keys'],
      '/tmp': ['exploit.sh'],
      '/bin': ['sh', 'bash']
    };
    const FILES = {
      '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:User:/home/user:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
      '/etc/shadow': 'root:$6$xyz...REDACTED...\nuser:$6$abc...REDACTED...',
      '/etc/ssh/sshd_config': '#PermitRootLogin prohibit-password\nPasswordAuthentication yes\nPort 22',
      '/var/log/auth.log': 'Oct 12 09:14:02 lab sshd[1201]: Failed password for root from 203.0.113.5 port 44211\nOct 12 09:14:05 lab sshd[1201]: Accepted publickey for user from 198.51.100.7',
      '/var/log/syslog': 'Oct 12 08:00:01 lab systemd[1]: Started Apache HTTP Server.',
      '/var/www/html/index.html': '<!doctype html><html><body>shop</body></html>',
      '/var/www/html/panel.php': '<?php // suspicious file created today ?>',
      '/home/user/.ssh/authorized_keys': 'ssh-ed25519 AAAA... user@lab',
      '/home/user/.secret_flag': 'FLAG{b4sh_m4st3r_2026}\nПоздравляем! Ты нашел скрытый флаг в домашней директории.',
      '/home/user/notes.txt': 'TODO: change password, read /etc/shadow (no access)',
      '/tmp/exploit.sh': '#!/bin/bash\necho "just a training file"',
      '/bin/sh': '[binary]', '/bin/bash': '[binary]'
    };

    /* sandbox: quests */
    const questProgress = {};
    function completeQuest(id, msg) {
      if (questProgress[id]) return;
      questProgress[id] = true;
      const qEl = $('#quest-' + id);
      if (qEl) {
        qEl.classList.add('completed');
        const st = qEl.querySelector('.q-status');
        if (st) st.textContent = '✓ Выполнен';
      }
      toast('🚩 ' + msg);
    }

    function checkQuests(rawLine) {
      const c = rawLine.toLowerCase();
      // Quest 1: Recon logs
      if (!questProgress[1] && (c.includes('auth.log') && (c.includes('grep') || c.includes('cat') || c.includes('failed')))) {
        completeQuest(1, 'Квест 1 пройден: IP 203.0.113.5 найден в auth.log!');
      }
      // Quest 2: Hidden flag in home
      if (!questProgress[2] && (c.includes('.secret_flag') || (c.includes('ls') && (c.includes('-a') || c.includes('-la'))))) {
        completeQuest(2, 'Квест 2 пройден: Скрытый флаг обнаружен!');
      }
      // Quest 3: Audit users with bash in /etc/passwd
      if (!questProgress[3] && c.includes('/etc/passwd') && (c.includes('cat') || c.includes('grep') || c.includes('bash'))) {
        completeQuest(3, 'Квест 3 пройден: Пользователи root и user найдены!');
      }
    }

    /* sandbox: core */
    const sbOut = $('#termBody'), sbInput = $('#termInput'), termPromptEl = $('#termPrompt');
    let cwd = '/home/user', history = [], histPos = -1;

    function promptStr() { return 'user@lab:' + cwd + '$ '; }
    function updatePrompt() { if (termPromptEl) termPromptEl.textContent = promptStr(); }
    function normPath(p) {
      if (!p) return cwd;
      let parts = p.startsWith('/') ? [p] : [cwd, p];
      const stack = [];
      for (const part of parts.join('/').split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') { stack.pop(); } else stack.push(part);
      }
      return '/' + stack.join('/');
    }
    function print(html) { const d = document.createElement('div'); d.className = 'sb-line'; d.innerHTML = html; sbOut.appendChild(d); sbOut.scrollTop = sbOut.scrollHeight; }
    function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function parseArgs(str) {
      const matches = str.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      return matches.map(m => {
        if ((m.startsWith('"') && m.endsWith('"')) || (m.startsWith("'") && m.endsWith("'"))) {
          return m.slice(1, -1);
        }
        return m;
      });
    }

    function exec(raw) {
      const line = raw.trim();
      if (!line) return;
      history.push(line);
      histPos = history.length;
      print('<span class="t-prompt">' + esc(promptStr()) + '</span>' + esc(line));
      checkQuests(line);

      // Поддержка пайплайна: cmd1 | grep pattern
      let mainCmdStr = line;
      let pipeFilter = null;
      if (line.includes('|')) {
        const pipeParts = line.split('|').map(s => s.trim());
        mainCmdStr = pipeParts[0];
        const pipeArgs = parseArgs(pipeParts[1] || '');
        if (pipeArgs[0] === 'grep' && pipeArgs[1]) {
          pipeFilter = pipeArgs[1];
        }
      }

      const args = parseArgs(mainCmdStr);
      const cmd = args.shift() || '';
      let out = '';

      switch (cmd) {
        case 'help': out = 'Доступно: ls, cd, cat, whoami, id, pwd, uname, ps, ss, grep <pattern> <file>, find <path> -name <pattern>, chmod, history, clear, help. Файлы-подсказки: /etc/passwd, /var/log/auth.log, /tmp/exploit.sh'; break;
        case 'pwd': out = cwd; break;
        case 'whoami': out = 'user (uid=1000) — в песочнице ты обычный пользователь'; break;
        case 'id': out = 'uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)'; break;
        case 'history': out = history.map((h, i) => '  ' + (i + 1) + '  ' + h).join('\n'); break;
        case 'clear': sbOut.innerHTML = ''; return;
        case 'ls': {
          const nonFlags = args.filter(a => !a.startsWith('-'));
          const target = normPath(nonFlags[0] || '.');
          if (FS[target]) {
            out = FS[target].map(n => {
              const full = target === '/' ? '/' + n : target + '/' + n;
              return FS[full] ? n + '/' : n;
            }).join('  ');
          } else if (FILES[target]) {
            out = nonFlags[0] || '';
          } else {
            out = 'ls: cannot access "' + (nonFlags[0] || '.') + '": No such file or directory';
          }
          break;
        }
        case 'cd': {
          let targetArg = args.find(a => !a.startsWith('-'));
          if (!targetArg || targetArg === '~') targetArg = '/home/user';
          const target = normPath(targetArg);
          if (FS[target]) { cwd = target; updatePrompt(); }
          else print('bash: cd: ' + esc(args[0] || '') + ': No such file or directory');
          break;
        }
        case 'cat': {
          const target = normPath(args.find(a => !a.startsWith('-')));
          out = FILES[target] !== undefined ? FILES[target] : 'cat: ' + (args[0] || '') + ': No such file or directory';
          break;
        }
        case 'uname': out = 'Linux lab 6.5.0-14-generic #14-Ubuntu SMP x86_64 GNU/Linux'; break;
        case 'ps': out = '  PID TTY          TIME CMD\n  120 ?        00:00:00 sshd\n  456 pts/0    00:00:00 bash\n  789 ?        00:00:01 apache2'; break;
        case 'ss': out = 'State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port\nLISTEN  0       128      0.0.0.0:22         0.0.0.0:*\nLISTEN  0       128      0.0.0.0:80         0.0.0.0:*'; break;
        case 'grep': {
          const nonFlags = args.filter(a => !a.startsWith('-'));
          const pat = nonFlags[0];
          const file = nonFlags[1];
          if (!pat || !file) out = 'usage: grep <pattern> <file>';
          else {
            const target = normPath(file);
            if (FILES[target] === undefined) out = 'grep: ' + target + ': No such file or directory';
            else { const hits = FILES[target].split('\n').filter(l => l.includes(pat)); out = hits.join('\n'); }
          }
          break;
        }
        case 'find': {
          const nonFlags = args.filter(a => !a.startsWith('-') || a === '-name');
          const start = (args[0] && !args[0].startsWith('-')) ? normPath(args[0]) : cwd;
          let name = null;
          for (let i = 0; i < args.length - 1; i++) { if (args[i] === '-name') name = args[i + 1].replace(/['"]/g, ''); }
          if (!name) out = 'usage: find <path> -name <pattern>';
          else {
            const pattern = name.replace(/\*/g, '');
            const all = [...Object.keys(FILES), ...Object.keys(FS).filter(k => k !== '/')];
            const matches = all.filter(p => p.startsWith(start) && p.split('/').pop().includes(pattern));
            out = matches.join('\n');
          }
          break;
        }
        case 'chmod': out = ''; break;
        default: out = 'bash: ' + cmd + ': command not found (это учебная песочница — полный список в help)';
      }

      if (pipeFilter && out) {
        out = out.split('\n').filter(l => l.includes(pipeFilter)).join('\n');
      }

      if (out !== undefined && out !== '') print(esc(out).replace(/\n/g, '<br>'));
    }

    sbInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { exec(sbInput.value); sbInput.value = ''; }
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histPos > 0) { histPos--; sbInput.value = history[histPos]; }
      }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histPos < history.length - 1) { histPos++; sbInput.value = history[histPos]; }
        else { histPos = history.length; sbInput.value = ''; }
      }
    });

    $('#termForm').addEventListener('submit', e => e.preventDefault());
    $$('.hint-chip').forEach(c => c.addEventListener('click', () => { sbInput.value = c.dataset.cmd; sbInput.focus(); }));
    function resetSandbox() { sbOut.innerHTML = ''; cwd = '/home/user'; history = []; histPos = -1; updatePrompt(); print('CyberSec Sandbox v1.0 — учебная Linux-песочница (всё фейковое, ничего не ломается).'); print('Введи help для списка команд.'); }
    $('#termReset').addEventListener('click', resetSandbox);

    /* back to top */
    const backToTopBtn = $('#backToTopBtn');
    if (backToTopBtn) {
      window.addEventListener('scroll', () => {
        backToTopBtn.classList.toggle('visible', window.scrollY > 400);
      }, { passive: true });
      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* init */
    renderCardButtons();
    updateDynamicIps();
    syncCategoryTabs();
    print('CyberSec Sandbox v1.0 — учебная Linux-песочница (всё фейковое, ничего не ломается).');
    print('Введи help для списка команд.');
    onScroll();

