const WELCOME_PRIMER = `This message was automatically sent by a Chrome extension called "Claude Auto-Primer." It injects a primer like this at the start of every new Claude conversation, before the user types anything. Its purpose is to give you standing instructions, preferences, or context that the user wants applied to every conversation without having to type them out each time.

This is the default template, which means the user has just installed the extension and hasn't written their own instructions yet. Please welcome them, briefly confirm that the extension is working, and suggest some examples of what they could put here, such as:

Formatting preferences (e.g. "keep responses concise" or "avoid bullet points")
Any standing rules (e.g. "always use UK English spelling")
Rules to reduce AI-sounding output (e.g. "never use em dashes," "avoid words like delve, straightforward, and leverage," "don't start responses with Sure! or Great question!")

A second profile called "Writing Style" is included as an example. You can switch profiles using the dropdown in the extension popup.

If "Auto-rename chat to date/time" is enabled on a profile, the extension will rename this chat in the sidebar to the date, time, and profile name.

Let them know they can customise their primer by clicking the extension icon in the Chrome toolbar. Keep your response brief.`;

const WRITING_STYLE_PRIMER = `Use UK English spelling throughout.
Write in flowing prose with paragraphs rather than bullet points or numbered lists, and avoid bold or italics formatting. Only use lists when truly necessary or explicitly requested.
Never use em dashes in any form, including the character or the word. Use commas, full stops, colons, semicolons, or parentheses instead.
Be concise in all responses. Lead with the answer and skip preamble.
Never create documentation files unless explicitly asked. When editing drafted text, show the updated version in the chat, not in a file.
Don't start responses with filler phrases like Sure!, Great question!, Absolutely!, or Of course!. Avoid words like delve, straightforward, leverage, utilize, and robust.
Be direct and honest. Disagree when the user is wrong.
Use plain, accessible language rather than management speak or corporate jargon. Prefer simple phrasing over formal business terminology.
Avoid common AI-generated phrasing such as: In today's, It's important to note, In conclusion, Furthermore, Moreover, plays a crucial role, essential, vital, comprehensive, landscape, navigate, foster, empower, holistic, it is worth noting, and firstly/secondly/thirdly. Vary sentence length and structure. Write as a person would, not as a language model would.`;

function createDefaultProfiles() {
  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();
  const defaults = [
    { id: id1, name: 'Getting Started', text: WELCOME_PRIMER },
    { id: id2, name: 'Writing Style', text: WRITING_STYLE_PRIMER }
  ];
  chrome.storage.local.set({ enabled: true, profiles: defaults, activeProfileId: id1 });
  return { enabled: true, profiles: defaults, activeProfileId: id1 };
}

function migrateIfNeeded(result) {
  // First install: no data at all
  if (!result.profiles && !result.primerText && result.enabled === undefined) {
    return createDefaultProfiles();
  }
  // Migration: old flat primerText format
  if (result.primerText && !result.profiles) {
    const id = crypto.randomUUID();
    const migrated = [{ id, name: 'Default', text: result.primerText }];
    chrome.storage.local.set({ profiles: migrated, activeProfileId: id });
    chrome.storage.local.remove('primerText');
    return { enabled: result.enabled, profiles: migrated, activeProfileId: id };
  }
  // Empty profiles array
  if (!result.profiles || result.profiles.length === 0) {
    return createDefaultProfiles();
  }
  // Normal
  return { enabled: result.enabled, profiles: result.profiles, activeProfileId: result.activeProfileId ?? null };
}
