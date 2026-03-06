const enabledCheckbox = document.getElementById('enabled');
const profileSelect = document.getElementById('profileSelect');
const profileNameInput = document.getElementById('profileName');
const primerTextarea = document.getElementById('primerText');
const newProfileBtn = document.getElementById('newProfile');
const deleteProfileBtn = document.getElementById('deleteProfile');
const statusEl = document.getElementById('status');

let profiles = [];
let activeProfileId = null;
let saveTimer = null;

const DEFAULT_PRIMER_TEXT = `Welcome! This message was sent automatically by the Claude Auto-Primer extension.

HOW TO USE:
1. Replace this text with your own primer instructions
2. Create multiple profiles for different use cases (e.g. Coding, Writing, Research)
3. Switch profiles from the dropdown in the extension popup
4. Toggle the checkbox to enable/disable auto-sending

Your primer will be sent automatically whenever you open a new Claude chat.`;

function createDefaultProfile() {
  const id = crypto.randomUUID();
  const defaultProfiles = [{ id, name: 'Getting Started', text: DEFAULT_PRIMER_TEXT }];
  chrome.storage.local.set({ profiles: defaultProfiles, activeProfileId: id });
  return { profiles: defaultProfiles, activeProfileId: id };
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
  if (!result.profiles || result.profiles.length === 0) {
    return createDefaultProfile();
  }
  return { profiles: result.profiles, activeProfileId: result.activeProfileId ?? null };
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
  } else {
    profileNameInput.value = '';
    primerTextarea.value = '';
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
  enabledCheckbox.checked = result.enabled ?? false;
  const migrated = migrateIfNeeded(result);
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
profileNameInput.addEventListener('input', save);
primerTextarea.addEventListener('input', save);
