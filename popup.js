const enabledCheckbox = document.getElementById('enabled');
const autoRenameCheckbox = document.getElementById('autoRename');
const profileSelect = document.getElementById('profileSelect');
const profileNameInput = document.getElementById('profileName');
const primerTextarea = document.getElementById('primerText');
const newProfileBtn = document.getElementById('newProfile');
const deleteProfileBtn = document.getElementById('deleteProfile');
const statusEl = document.getElementById('status');

let profiles = [];
let activeProfileId = null;
let saveTimer = null;

const DEFAULT_PRIMER_TEXT = `This message was automatically sent by a Chrome extension called "Claude Auto-Primer." The extension injects a message like this at the start of every new Claude conversation, before the user types anything. Its purpose is to give you (Claude) standing instructions, preferences, or context that the user wants applied to every conversation without having to type them out each time.

Claude can sometimes lose track of instructions during long conversations. This extension ensures your preferences and rules are always present at the start of every session, reinforcing them where they matter most.

This is the default template, which means the user has just installed the extension and hasn't written their own instructions yet. Please welcome them, briefly confirm that the extension is working, and suggest some examples of what they could put here, such as:

Formatting preferences (e.g. "keep responses concise" or "avoid bullet points")
Any standing rules (e.g. "always use UK English spelling")
Rules to reduce AI-sounding output (e.g. "never use em dashes," "avoid words like delve, straightforward, and leverage," "don't start responses with Sure! or Great question!")

The date and time at the top of this message was added automatically by the extension so that the chat gets a useful name in the sidebar.

Let them know they can customise this message by clicking the extension icon in their browser toolbar, and that they can create multiple profiles for different use cases. Keep your response brief.`;

const WRITING_STYLE_TEXT = `Use UK English spelling throughout.
Write in flowing prose with paragraphs rather than bullet points or numbered lists, and avoid bold or italics formatting. Only use lists when truly necessary or explicitly requested.
Never use em dashes in any form, including the character or the word. Use commas, full stops, colons, semicolons, or parentheses instead.
Be concise in all responses. Lead with the answer and skip preamble.
Never create documentation files unless explicitly asked. When editing drafted text, show the updated version in the chat, not in a file.
Don't start responses with filler phrases like Sure!, Great question!, Absolutely!, or Of course!. Avoid words like delve, straightforward, leverage, utilize, and robust.
Be direct and honest. Disagree when the user is wrong.
Use plain, accessible language rather than management speak or corporate jargon. Prefer simple phrasing over formal business terminology.
Avoid common AI-generated phrasing such as: In today's, It's important to note, In conclusion, Furthermore, Moreover, plays a crucial role, essential, vital, comprehensive, landscape, navigate, foster, empower, holistic, it is worth noting, and firstly/secondly/thirdly. Vary sentence length and structure. Write as a person would, not as a language model would.`;

function createDefaultProfile() {
  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();
  const defaultProfiles = [
    { id: id1, name: 'Getting Started', text: DEFAULT_PRIMER_TEXT },
    { id: id2, name: 'Writing Style', text: WRITING_STYLE_TEXT }
  ];
  chrome.storage.local.set({ enabled: true, profiles: defaultProfiles, activeProfileId: id1 });
  return { enabled: true, profiles: defaultProfiles, activeProfileId: id1 };
}

// Migration: convert old flat primerText to profiles format
function migrateIfNeeded(result) {
  if (result.primerText && !result.profiles) {
    const id = crypto.randomUUID();
    const migrated = [{ id, name: 'Default', text: result.primerText }];
    chrome.storage.local.set({ profiles: migrated, activeProfileId: id });
    chrome.storage.local.remove('primerText');
    return { profiles: migrated, activeProfileId: id, enabled: result.enabled };
  }
  if (!result.profiles || result.profiles.length === 0) {
    return createDefaultProfile();
  }
  return { profiles: result.profiles, activeProfileId: result.activeProfileId ?? null, enabled: result.enabled };
}

function renderProfileSelect() {
  profileSelect.innerHTML = '';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    profileSelect.appendChild(opt);
  });
  profileSelect.value = activeProfileId ?? '';
  deleteProfileBtn.disabled = profiles.length <= 1;
}

function loadActiveProfile() {
  const profile = profiles.find(p => p.id === activeProfileId);
  if (profile) {
    profileNameInput.value = profile.name;
    primerTextarea.value = profile.text;
    autoRenameCheckbox.checked = profile.autoRename ?? false;
  } else {
    profileNameInput.value = '';
    primerTextarea.value = '';
    autoRenameCheckbox.checked = false;
  }
}

function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ''; }, 1500);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Update current profile's name and text from inputs
    const profile = profiles.find(p => p.id === activeProfileId);
    if (profile) {
      profile.name = profileNameInput.value;
      profile.text = primerTextarea.value;
      profile.autoRename = autoRenameCheckbox.checked;
      // Update dropdown label
      const opt = profileSelect.querySelector(`option[value="${profile.id}"]`);
      if (opt) opt.textContent = profile.name;
    }
    chrome.storage.local.set({
      enabled: enabledCheckbox.checked,
      profiles,
      activeProfileId
    }, () => showStatus('Saved'));
  }, 300);
}

// Load saved settings
chrome.storage.local.get(['enabled', 'primerText', 'profiles', 'activeProfileId'], (result) => {
  const migrated = migrateIfNeeded(result);
  enabledCheckbox.checked = migrated.enabled ?? result.enabled ?? false;
  profiles = migrated.profiles;
  activeProfileId = migrated.activeProfileId;
  renderProfileSelect();
  loadActiveProfile();
});

// Profile switching
profileSelect.addEventListener('change', () => {
  activeProfileId = profileSelect.value;
  loadActiveProfile();
  save();
});

// New profile
newProfileBtn.addEventListener('click', () => {
  const id = crypto.randomUUID();
  const name = 'Profile ' + (profiles.length + 1);
  profiles.push({ id, name, text: '' });
  activeProfileId = id;
  renderProfileSelect();
  loadActiveProfile();
  profileNameInput.focus();
  profileNameInput.select();
  save();
});

// Delete profile
deleteProfileBtn.addEventListener('click', () => {
  if (profiles.length <= 1) return;
  profiles = profiles.filter(p => p.id !== activeProfileId);
  activeProfileId = profiles[0].id;
  renderProfileSelect();
  loadActiveProfile();
  save();
});

// Auto-save on edits
enabledCheckbox.addEventListener('change', save);
autoRenameCheckbox.addEventListener('change', save);
profileNameInput.addEventListener('input', save);
primerTextarea.addEventListener('input', save);
