(() => {
  const INTERNAL_HOSTS = new Set([location.host, 'lvtbz.github.io', 'gaomx.github.io']);
  const SPINE = 40;
  const MIN_STACK_WIDTH = 768;
  const main = document.querySelector('main.main');
  const firstArticle = main && main.querySelector('article.post-single');
  if (!firstArticle) return;

  const cache = new Map();
  const canHover = matchMedia('(hover: hover)').matches;
  const normPath = (p) => decodeURIComponent(p.endsWith('/') ? p : p + '/');

  function internalUrl(a) {
    const raw = a.getAttribute('href');
    if (!raw || raw.startsWith('#') || a.hasAttribute('download')) return null;
    let url;
    try { url = new URL(a.href, location.href); } catch { return null; }
    if (!/^https?:$/.test(url.protocol) || !INTERNAL_HOSTS.has(url.host)) return null;
    if (/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !/\.html?$/i.test(url.pathname)) return null;
    return url;
  }

  function load(path) {
    if (!cache.has(path)) {
      cache.set(path, fetch(path).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const art = doc.querySelector('article.post-single');
        if (!art || !art.querySelector('.post-content')) throw new Error('not a note');
        art.querySelectorAll('.breadcrumbs, script').forEach((n) => n.remove());
        const title = (art.querySelector('.post-title') || {}).textContent || path;
        return { title: title.trim(), html: art.outerHTML };
      }).catch((e) => { cache.delete(path); throw e; }));
    }
    return cache.get(path);
  }

  // ---------- external links & comments ----------
  function prepareContent(root) {
    root.querySelectorAll('a[href]').forEach((a) => {
      const raw = a.getAttribute('href');
      if (!raw || raw.startsWith('#') || internalUrl(a)) return;
      let url;
      try { url = new URL(a.href, location.href); } catch { return; }
      if (!/^https?:$/.test(url.protocol)) return;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    root.querySelectorAll('.sn-comments').forEach(mountComments);
  }

  const GISCUS = 'https://giscus.app';
  const giscusTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  (() => {
    const u = new URL(location.href);
    const session = u.searchParams.get('giscus');
    if (session) {
      localStorage.setItem('giscus-session', JSON.stringify(session));
      u.searchParams.delete('giscus');
      history.replaceState(history.state, '', u);
    }
  })();

  function mountComments(box) {
    if (box.querySelector('iframe')) return;
    const d = box.dataset;
    if (!d.repo || !d.repoId || !d.categoryId) return;
    let session = '';
    try { session = JSON.parse(localStorage.getItem('giscus-session') || '""'); } catch { /* ignore */ }
    const back = new URL(location.href);
    back.hash = '';
    const term = (d.path || location.pathname).replace(/^\//, '').replace(/\.\w+$/, '') || 'index';
    const params = new URLSearchParams({
      origin: back.toString(),
      session,
      theme: giscusTheme(),
      reactionsEnabled: '1',
      emitMetadata: '0',
      inputPosition: 'bottom',
      repo: d.repo,
      repoId: d.repoId,
      category: d.category || '',
      categoryId: d.categoryId,
      strict: '0',
      description: '',
      backLink: new URL(d.path || location.pathname, location.origin).toString(),
      term,
    });
    const f = document.createElement('iframe');
    f.className = 'giscus-frame';
    f.title = 'Comments';
    f.setAttribute('scrolling', 'no');
    f.setAttribute('allow', 'clipboard-write');
    f.loading = 'lazy';
    f.src = `${GISCUS}/${d.lang || 'zh-CN'}/widget?${params}`;
    box.appendChild(f);
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== GISCUS || !e.data || !e.data.giscus) return;
    const g = e.data.giscus;
    const f = [...document.querySelectorAll('iframe.giscus-frame')].find((x) => x.contentWindow === e.source);
    if (f && g.resizeHeight) f.style.height = g.resizeHeight + 'px';
    if (g.signOut) localStorage.removeItem('giscus-session');
  });

  new MutationObserver(() => {
    document.querySelectorAll('iframe.giscus-frame').forEach((f) => {
      f.contentWindow && f.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, GISCUS);
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- stack ----------
  const stack = document.createElement('div');
  stack.className = 'sn-stack';
  main.insertBefore(stack, firstArticle);
  const cols = [];

  function makeCol(path, title, contentNode) {
    const col = document.createElement('section');
    col.className = 'sn-col';
    col.dataset.path = path;
    const spine = document.createElement('button');
    spine.className = 'sn-spine';
    spine.type = 'button';
    spine.title = '回到：' + title;
    spine.textContent = title;
    const body = document.createElement('div');
    body.className = 'sn-body';
    body.appendChild(contentNode);
    col.append(spine, body);
    if (cols.length) {
      contentNode.querySelectorAll('.sn-comments-wrap').forEach((n) => n.remove());
      const h = contentNode.querySelector('.post-title');
      if (h) {
        const link = document.createElement('a');
        link.className = 'sn-title-link';
        link.href = path;
        link.title = '单独打开这篇';
        while (h.firstChild) link.appendChild(h.firstChild);
        h.appendChild(link);
      }
    }
    prepareContent(body);
    if (cols.length) {
      const close = document.createElement('button');
      close.className = 'sn-close';
      close.type = 'button';
      close.title = '关闭';
      close.textContent = '×';
      col.appendChild(close);
    }
    return col;
  }

  const firstTitle = (firstArticle.querySelector('.post-title') || {}).textContent || document.title;
  const col0 = makeCol(normPath(location.pathname), firstTitle.trim(), firstArticle);
  stack.appendChild(col0);
  cols.push(col0);

  const colWidth = () => col0.getBoundingClientRect().width || 625;
  const stackEnabled = () => window.innerWidth >= MIN_STACK_WIDTH;

  function layout() {
    document.body.classList.toggle('sn-stacked', cols.length > 1);
    cols.forEach((c, i) => {
      c.style.setProperty('--i', i);
      c.style.zIndex = i + 1;
    });
    updateCollapsed();
    markOpenLinks();
  }

  function updateCollapsed() {
    for (let i = 0; i < cols.length; i++) {
      const next = cols[i + 1];
      const collapsed = !!next &&
        next.getBoundingClientRect().left - cols[i].getBoundingClientRect().left < SPINE * 2;
      cols[i].classList.toggle('sn-collapsed', collapsed);
    }
  }

  function scrollToCol(i, smooth = true) {
    const w = colWidth();
    // column i fully visible with columns 0..i-1 folded into spines on its left
    const left = Math.max(0, i * (w - SPINE));
    const lastFit = Math.max(0, (i + 1) * w - stack.clientWidth);
    stack.scrollTo({ left: Math.min(left, Math.max(lastFit, left)), behavior: smooth ? 'smooth' : 'auto' });
    flash(cols[i]);
  }

  function revealCol(i, smooth = true) {
    // keep as many columns visible as possible, ending at column i
    const w = colWidth();
    stack.scrollTo({ left: Math.max(0, (i + 1) * w - stack.clientWidth), behavior: smooth ? 'smooth' : 'auto' });
    flash(cols[i]);
  }

  function flash(col) {
    if (!col) return;
    col.classList.remove('sn-flash');
    void col.offsetWidth;
    col.classList.add('sn-flash');
  }

  function indexOfPath(path) { return cols.findIndex((c) => c.dataset.path === path); }

  async function openNote(path, { push = true, smooth = true } = {}) {
    const existing = indexOfPath(path);
    if (existing >= 0) { scrollToCol(existing, smooth); return; }
    const note = await load(path);
    if (indexOfPath(path) >= 0) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = note.html;
    const col = makeCol(path, note.title, tpl.content.firstElementChild);
    stack.appendChild(col);
    cols.push(col);
    layout();
    if (push) syncUrl();
    revealCol(cols.length - 1, smooth);
  }

  function closeCol(i) {
    if (i <= 0) return;
    cols.splice(i, 1)[0].remove();
    layout();
    syncUrl();
  }

  function stackedPaths() { return cols.slice(1).map((c) => c.dataset.path); }

  // URL mirrors the stack so refresh/share restores it, but no history entries are added:
  // browser Back leaves the page instead of resurrecting closed notes.
  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.delete('stacked');
    stackedPaths().forEach((p) => url.searchParams.append('stacked', p));
    history.replaceState(history.state, '', url);
  }

  async function restoreFromUrl() {
    const want = new URL(location.href).searchParams.getAll('stacked').map(normPath);
    for (let i = cols.length - 1; i >= 1; i--) {
      if (!want.includes(cols[i].dataset.path)) cols.splice(i, 1)[0].remove();
    }
    layout();
    for (const p of want) {
      try { await openNote(p, { push: false, smooth: false }); } catch (e) { /* skip broken */ }
    }
  }

  stack.addEventListener('scroll', () => requestAnimationFrame(updateCollapsed), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(updateCollapsed));

  function markOpenLinks() {
    const open = new Set(cols.map((c) => c.dataset.path));
    document.querySelectorAll('.sn-stack a[href]:not(.sn-title-link)').forEach((a) => {
      const u = internalUrl(a);
      a.classList.toggle('sn-link-open', !!u && open.has(normPath(u.pathname)));
    });
  }

  // ---------- clicks ----------
  document.addEventListener('click', (e) => {
    const spine = e.target.closest('.sn-spine');
    if (spine) { scrollToCol(cols.indexOf(spine.parentElement)); return; }
    const close = e.target.closest('.sn-close');
    if (close) { closeCol(cols.indexOf(close.parentElement)); return; }

    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!a.closest('.sn-stack, .sn-preview')) return;
    const url = internalUrl(a);
    if (!url) return; // external link: browser default
    const path = normPath(url.pathname);
    const ownCol = a.closest('.sn-col');
    if (ownCol && ownCol.dataset.path === path) {
      if (url.hash) {
        e.preventDefault();
        const t = ownCol.querySelector(CSS.escape(decodeURIComponent(url.hash)));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (!stackEnabled()) return;
    e.preventDefault();
    hidePreview(true);
    openNote(path).catch(() => { location.href = url.href; });
  });

  // ---------- hover preview ----------
  const preview = document.createElement('div');
  preview.className = 'sn-preview';
  document.body.appendChild(preview);
  let showTimer, hideTimer, currentLink;

  function hidePreview(now) {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    const go = () => { preview.classList.remove('sn-show'); currentLink = null; };
    now ? go() : (hideTimer = setTimeout(go, 250));
  }

  function placePreview(a) {
    const r = a.getBoundingClientRect();
    const pw = preview.offsetWidth, ph = preview.offsetHeight;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    preview.style.left = left + 'px';
    preview.style.top = top + 'px';
  }

  if (canHover) {
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('.sn-preview')) { clearTimeout(hideTimer); return; }
      const a = e.target.closest('a[href]');
      if (!a || !a.closest('.sn-stack')) return;
      const url = internalUrl(a);
      if (!url) return;
      const path = normPath(url.pathname);
      const ownCol = a.closest('.sn-col');
      if (ownCol && ownCol.dataset.path === path) return;
      clearTimeout(hideTimer);
      if (currentLink === a) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(async () => {
        try {
          const note = await load(path);
          currentLink = a;
          preview.innerHTML = note.html;
          preview.querySelectorAll('.sn-comments').forEach((n) => n.remove());
          preview.classList.add('sn-show');
          placePreview(a);
        } catch (err) { /* ignore */ }
      }, 300);
    });
    document.addEventListener('mouseout', (e) => {
      const from = e.target.closest('a[href], .sn-preview');
      if (!from) return;
      const to = e.relatedTarget;
      if (to && (to.closest && (to.closest('.sn-preview') || to.closest('a[href]') === from))) return;
      hidePreview(false);
    });
  }

  layout();
  if (new URL(location.href).searchParams.has('stacked')) restoreFromUrl();
})();
