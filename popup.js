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
  enabledCheckbox.checked = migrated.enabled ?? false;
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
