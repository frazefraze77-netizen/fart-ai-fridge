"use strict";

// Hydrate before the original scripts run, then serialize all writes to Netlify.
(async () => {
  const status = document.createElement('div');
  status.id = 'save-status';
  status.setAttribute('role', 'status');
  Object.assign(status.style, { position: 'fixed', bottom: '16px', right: '16px', zIndex: '1000', padding: '12px 18px', borderRadius: '12px', background: '#15392e', color: '#fff', maxWidth: 'min(400px, 90vw)', font: '14px sans-serif' });
  document.body.append(status);
  status.textContent = 'Opening your kitchen…';
  let values = {};
  let version = 0;
  let savedVersion = 0;
  let saving = false;
  let retryTimer;

  function message(text, retry) {
    status.hidden = false;
    status.replaceChildren(document.createTextNode(text));
    if (retry) {
      const button = document.createElement('button');
      button.textContent = 'Retry';
      button.style.marginLeft = '12px';
      button.onclick = retry;
      status.append(button);
    }
  }

  async function save() {
    if (saving) return;
    saving = true;
    clearTimeout(retryTimer);
    try {
      while (savedVersion < version) {
        const sendingVersion = version;
        message('Saving your kitchen…');
        const response = await fetch('/api/kitchen', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
        });
        if (!response.ok) throw new Error('Save failed');
        savedVersion = sendingVersion;
      }
      status.hidden = true;
    } catch {
      message('Changes are waiting to save. Keep this page open.', save);
      retryTimer = setTimeout(save, 15000);
    } finally { saving = false; }
  }

  window.FartStorage = {
    getItem(key) { return values[key] ?? null; },
    setItem(key, value) { values[key] = String(value); version++; void save(); },
  };
  window.addEventListener('online', () => { if (version > savedVersion) void save(); });
  window.addEventListener('beforeunload', event => {
    if (version > savedVersion) { event.preventDefault(); event.returnValue = ''; }
  });

  async function start() {
    message('Opening your kitchen…');
    try {
      const response = await fetch('/api/kitchen', { cache: 'no-store' });
      if (!response.ok) throw new Error('Load failed');
      values = await response.json();
    } catch {
      message('Your kitchen could not load. Check your connection.', start);
      return;
    }
    status.hidden = true;
    for (const entry of document.querySelectorAll('script[data-app-src]')) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = entry.dataset.appSrc;
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
      } catch {
        message('Some kitchen tools could not load.', () => location.reload());
        break;
      }
    }
  }
  await start();
})();
