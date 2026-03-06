(() => {
  const SELECTORS = {
    input: [
      '[data-testid="chat-input"]',
      '.ProseMirror[contenteditable="true"]',
      '[role="textbox"]'
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]'
    ],
    responses: '.standard-markdown, .progressive-markdown',
    streaming: '[data-is-streaming="true"]'
  };

  const primedUrls = new Set();
  let lastUrl = location.href;
  let enabled = false;
  let profiles = [];
  let activeProfileId = null;

  function getActivePrimerText() {
    if (!activeProfileId || !profiles.length) return '';
    const profile = profiles.find(p => p.id === activeProfileId);
    return profile?.text ?? '';
  }

  // Migration: convert old flat primerText to profiles format
  function migrateIfNeeded(result) {
    if (result.primerText && !result.profiles) {
      const id = crypto.randomUUID();
      const migrated = [{ id, name: 'Default', text: result.primerText }];
      chrome.storage.local.set({ profiles: migrated, activeProfileId: id });
      chrome.storage.local.remove('primerText');
      return { profiles: migrated, activeProfileId: id };
    }
    return { profiles: result.profiles ?? [], activeProfileId: result.activeProfileId ?? null };
  }

  // Load settings, then attempt primer
  chrome.storage.local.get(['enabled', 'primerText', 'profiles', 'activeProfileId'], (result) => {
    enabled = result.enabled ?? false;
    const migrated = migrateIfNeeded(result);
    profiles = migrated.profiles;
    activeProfileId = migrated.activeProfileId;
    console.log('[Auto-Primer] Settings loaded', { enabled, activeProfileId, profileCount: profiles.length });
    tryPrimer();
  });

  // Live settings updates
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.profiles) profiles = changes.profiles.newValue ?? [];
    if (changes.activeProfileId) activeProfileId = changes.activeProfileId.newValue;
  });

  function findElement(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function waitForElement(selectors, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = findElement(selectors);
      if (el) return resolve(el);

      const interval = 200;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += interval;
        const el = findElement(selectors);
        if (el) {
          clearInterval(timer);
          resolve(el);
        } else if (elapsed >= timeout) {
          clearInterval(timer);
          reject(new Error('Timed out waiting for element'));
        }
      }, interval);
    });
  }

  function getResponseCount() {
    const all = document.querySelectorAll(SELECTORS.responses);
    let count = 0;
    all.forEach(el => {
      if (!el.closest('div.rounded-lg.border-border-300')) count++;
    });
    return count;
  }

  function isFreshChat() {
    const path = location.pathname;
    const isChatUrl = path === '/new' || /^\/chat\/[a-f0-9-]+$/.test(path);
    return isChatUrl && getResponseCount() === 0;
  }

  async function injectAndSend(text) {
    let input;
    try {
      input = await waitForElement(SELECTORS.input);
    } catch {
      console.warn('[Auto-Primer] Input field not found');
      return;
    }

    input.focus();
    document.execCommand('selectAll');
    document.execCommand('delete');
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));

    await new Promise(r => setTimeout(r, 100));

    // Primary: Enter key
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    });
    input.dispatchEvent(enterEvent);

    // Hide text visually so user doesn't see it lingering
    input.style.color = 'transparent';

    // Fallback: click send button after a short delay if message wasn't sent
    await new Promise(r => setTimeout(r, 500));
    if (getResponseCount() === 0 && !document.querySelector(SELECTORS.streaming)) {
      const btn = findElement(SELECTORS.sendButton);
      if (btn) btn.click();
    }

    // Clear leftover text from the input field
    await new Promise(r => setTimeout(r, 500));
    input.focus();
    document.execCommand('selectAll');
    document.execCommand('delete');
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.style.color = '';
  }

  async function tryPrimer() {
    const primerText = getActivePrimerText();
    if (!enabled || !primerText.trim()) return;
    if (primedUrls.has(location.href)) return;

    // Small delay to let SPA finish rendering
    await new Promise(r => setTimeout(r, 500));

    if (!isFreshChat()) return;

    primedUrls.add(location.href);
    console.log('[Auto-Primer] Sending primer to fresh chat');
    await injectAndSend(primerText);
  }

  // Watch for SPA navigation
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      tryPrimer();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial load tryPrimer is now called inside the storage callback above
})();
