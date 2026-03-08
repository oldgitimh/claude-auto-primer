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
    streaming: '[data-is-streaming="true"]'
  };

  const primedUrls = new Set();
  let lastUrl = location.href;
  let enabled = false;
  let profiles = [];
  let activeProfileId = null;

  function getActiveProfile() {
    if (!activeProfileId || !profiles.length) return null;
    return profiles.find(p => p.id === activeProfileId) ?? null;
  }

  function getActivePrimerText() {
    return getActiveProfile()?.text ?? '';
  }

  // Load settings, then attempt primer
  chrome.storage.local.get(['enabled', 'primerText', 'profiles', 'activeProfileId'], (result) => {
    const migrated = migrateIfNeeded(result);
    enabled = migrated.enabled ?? false;
    profiles = migrated.profiles;
    activeProfileId = migrated.activeProfileId;
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

  function isFreshChat() {
    const path = location.pathname;
    return path === '/new' || /^\/project\/[a-f0-9-]+$/.test(path);
  }

  async function injectAndSend(text) {
    let input;
    try {
      input = await waitForElement(SELECTORS.input);
    } catch {
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
    if (!document.querySelector(SELECTORS.streaming)) {
      const btn = findElement(SELECTORS.sendButton);
      if (btn) btn.click();
    }

    // Wait for the message to actually leave the input
    await new Promise(r => setTimeout(r, 1500));
    input.focus();
    document.execCommand('selectAll');
    document.execCommand('delete');
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    input.style.color = '';
  }

  async function tryPrimer() {
    const primerText = getActivePrimerText();
    if (!enabled || !primerText.trim()) {
      return;
    }
    if (primedUrls.has(location.href)) {
      return;
    }
    primedUrls.add(location.href);

    // Small delay to let SPA finish rendering
    await new Promise(r => setTimeout(r, 500));

    if (!isFreshChat()) {
      return;
    }
    const profile = getActiveProfile();
    const now = new Date();
    const longDate = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const headerTimestamp = 'Chat Commenced: ' + longDate + ', ' + time;

    const shortDate = now.toLocaleDateString();
    const chatName = shortDate + ' ' + time + ' using ' + (profile?.name ?? 'Unknown');

    const advice = 'Auto-sent by Claude Auto-Primer extension. Apply the instructions below silently. Do not respond to this primer; wait for the user\'s first message. This is for this chat only. Do not check existing memory.';
    const fullText = headerTimestamp + '\n\n' + advice + '\n\n' + primerText;
    await injectAndSend(fullText);

    if (profile?.autoRename) {
      await renameChat(chatName);
    }
  }

  async function renameChat(newName) {
    // Wait for URL to change from /new to /chat/...
    let waited = 0;
    while (location.pathname === '/new' && waited < 15000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }
    if (location.pathname === '/new') {
      return;
    }

    // Wait a bit more for the title to render
    await new Promise(r => setTimeout(r, 2000));

    const titleBtn = document.querySelector('[data-testid="chat-title-button"]');
    if (!titleBtn) {
      return;
    }

    // Click the title button to enter edit mode
    titleBtn.click();

    // Wait for the rename input to appear
    let nameInput;
    try {
      nameInput = await waitForElement(['[data-testid="name-chat"]'], 3000);
    } catch {
      return;
    }

    // Set the new name
    nameInput.focus();
    nameInput.value = '';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput.value = newName;
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Press Enter to confirm
    nameInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    }));
  }

  // Watch for SPA navigation
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      tryPrimer();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
