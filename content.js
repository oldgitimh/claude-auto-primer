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

  const WELCOME_PRIMER = `This message was automatically sent by a Chrome extension called "Claude Auto-Primer." The extension injects a message like this at the start of every new Claude conversation, before the user types anything. Its purpose is to give you (Claude) standing instructions, preferences, or context that the user wants applied to every conversation without having to type them out each time.

Claude can sometimes lose track of instructions during long conversations. This extension ensures your preferences and rules are always present at the start of every session, reinforcing them where they matter most.

This is the default template, which means the user has just installed the extension and hasn't written their own instructions yet. Please welcome them, briefly confirm that the extension is working, and suggest some examples of what they could put here, such as:

Formatting preferences (e.g. "keep responses concise" or "avoid bullet points")
Any standing rules (e.g. "always use UK English spelling")
Rules to reduce AI-sounding output (e.g. "never use em dashes," "avoid words like delve, straightforward, and leverage," "don't start responses with Sure! or Great question!")

The date and time at the top of this message was added automatically by the extension so that the chat gets a useful name in the sidebar.

Let them know they can customise this message by clicking the extension icon in their browser toolbar, and that they can create multiple profiles for different use cases. Keep your response brief.`;

  const WRITING_STYLE_PRIMER = `Use UK English spelling throughout.
Write in flowing prose with paragraphs rather than bullet points or numbered lists, and avoid bold or italics formatting. Only use lists when truly necessary or explicitly requested.
Never use em dashes in any form, including the character or the word. Use commas, full stops, colons, semicolons, or parentheses instead.
Be concise in all responses. Lead with the answer and skip preamble.
Never create documentation files unless explicitly asked. When editing drafted text, show the updated version in the chat, not in a file.
Don't start responses with filler phrases like Sure!, Great question!, Absolutely!, or Of course!. Avoid words like delve, straightforward, leverage, utilize, and robust.
Be direct and honest. Disagree when the user is wrong.
Use plain, accessible language rather than management speak or corporate jargon. Prefer simple phrasing over formal business terminology.
Avoid common AI-generated phrasing such as: In today's, It's important to note, In conclusion, Furthermore, Moreover, plays a crucial role, essential, vital, comprehensive, landscape, navigate, foster, empower, holistic, it is worth noting, and firstly/secondly/thirdly. Vary sentence length and structure. Write as a person would, not as a language model would.`;

  // First install: seed default profiles, enabled by default
  function initIfFirstInstall(result) {
    if (!result.profiles && !result.primerText && result.enabled === undefined) {
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();
      const seeded = [
        { id: id1, name: 'Getting Started', text: WELCOME_PRIMER },
        { id: id2, name: 'Writing Style', text: WRITING_STYLE_PRIMER }
      ];
      chrome.storage.local.set({ enabled: true, profiles: seeded, activeProfileId: id1 });
      return { enabled: true, profiles: seeded, activeProfileId: id1 };
    }
    return null;
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
    const firstInstall = initIfFirstInstall(result);
    if (firstInstall) {
      enabled = firstInstall.enabled;
      profiles = firstInstall.profiles;
      activeProfileId = firstInstall.activeProfileId;
    } else {
      enabled = result.enabled ?? false;
      const migrated = migrateIfNeeded(result);
      profiles = migrated.profiles;
      activeProfileId = migrated.activeProfileId;
    }
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

    // Small delay to let SPA finish rendering
    await new Promise(r => setTimeout(r, 500));

    if (!isFreshChat()) {
      return;
    }

    primedUrls.add(location.href);
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
