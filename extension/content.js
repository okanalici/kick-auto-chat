const EDITOR_SELECTOR = '#channel-chatroom #chatroom-footer #chat-input-wrapper [data-testid="chat-input"][data-input="true"][contenteditable="true"][role="textbox"][data-lexical-editor="true"]';
let targetSelector = null;
let selectedPath = null;
let isRunning = false;
let lastError = null;
let generation = 0;
const timers = new Set();
let selectionHandler = null;
let escapeHandler = null;
let cleanupPendingInput = null;

function visible(element) {
  if (!element?.isConnected) return false;
  for (let node = element; node instanceof Element; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  }
  return true;
}

function resolveTarget() {
  if (targetSelector !== EDITOR_SELECTOR || selectedPath !== location.origin + location.pathname) return null;
  const editors = document.querySelectorAll(EDITOR_SELECTOR);
  const footers = document.querySelectorAll('#channel-chatroom #chatroom-footer');
  if (editors.length !== 1 || footers.length !== 1) return null;
  const editor = editors[0];
  const footer = footers[0];
  if (!visible(editor) || editor.closest('#chatroom-footer') !== footer || editor.getAttribute('aria-disabled') === 'true' || editor.readOnly || editor.getAttribute('aria-readonly') === 'true' || editor.closest('[inert]')) return null;
  return { editor, footer };
}

function sendControl(footer) {
  const controls = document.querySelectorAll('#send-message-button');
  if (controls.length !== 1 || !controls[0].matches('button') || controls[0].closest('#chatroom-footer') !== footer || !visible(controls[0])) return null;
  return controls[0];
}

function hasDraft(editor) {
  return editor.textContent !== '' || !!editor.querySelector('img, [data-lexical-decorator], [contenteditable="false"], video, audio, canvas, svg, iframe, object, input');
}

function matchesMessage(editor, text, emote) {
  if (!emote) return editor.textContent === text && !editor.querySelector('img, [data-lexical-decorator], [contenteditable="false"]');
  const images = editor.querySelectorAll('img');
  if (images.length === 0) return editor.textContent === text && !editor.querySelector('[data-lexical-decorator], [contenteditable="false"]');
  if (images.length !== 1 || !/^[ ]*$/.test(editor.textContent)) return false;
  const image = images[0];
  const decorator = image.parentElement;
  if (!decorator.matches('div.editor-custom-node[data-lexical-decorator="true"][contenteditable="false"]') || decorator.childNodes.length !== 1) return false;
  if (image.getAttribute('data-emote-name') !== text || image.getAttribute('alt') !== text || image.getAttribute('data-emote-id') !== emote.id || image.getAttribute('src') !== emote.url) return false;
  const attributesMatch = (node, expected) => node.attributes.length === Object.keys(expected).length && Object.entries(expected).every(([name, value]) => node.getAttribute(name) === value);
  const paragraph = editor.firstChild;
  if (editor.childNodes.length !== 1 || !(paragraph instanceof Element) || paragraph.tagName !== 'P' || !attributesMatch(paragraph, { class: 'editor-paragraph' })) return false;
  if (paragraph.firstChild !== decorator || paragraph.childNodes.length !== 2) return false;
  if (!attributesMatch(decorator, { class: 'editor-custom-node', 'data-lexical-decorator': 'true', contenteditable: 'false' })) return false;
  const imageAttributes = { alt: text, 'data-emote-id': emote.id, 'data-emote-name': text, src: emote.url };
  if (image.hasAttribute('class')) imageAttributes.class = 'mx-px inline h-5 w-5';
  if (!attributesMatch(image, imageAttributes)) return false;
  const trailing = paragraph.lastChild;
  return trailing instanceof Element && trailing.tagName === 'SPAN' && attributesMatch(trailing, { 'data-lexical-text': 'true' }) && trailing.childNodes.length === 1 && trailing.firstChild.nodeType === Node.TEXT_NODE && trailing.textContent === ' ';
}

function cleanupSelection() {
  if (selectionHandler) document.removeEventListener('click', selectionHandler, true);
  if (escapeHandler) document.removeEventListener('keydown', escapeHandler, true);
  selectionHandler = null;
  escapeHandler = null;
  document.getElementById('kick-bot-overlay')?.remove();
}

function stopBot(error = null) {
  generation++;
  isRunning = false;
  timers.forEach(clearTimeout);
  timers.clear();
  cleanupPendingInput?.();
  cleanupPendingInput = null;
  cleanupSelection();
  lastError = error;
}

function later(callback, delay, token) {
  const id = setTimeout(() => {
    timers.delete(id);
    if (isRunning && generation === token) callback();
  }, delay);
  timers.add(id);
}

function selectTargetMode() {
  stopBot();
  const overlay = document.createElement('div');
  overlay.id = 'kick-bot-overlay';
  overlay.textContent = 'Click the Kick chat input. Escape cancels.';
  overlay.style.cssText = 'position:fixed;top:20px;left:20px;z-index:999999;background:#0b0e11;color:#53fc18;padding:16px;pointer-events:none';
  document.body.appendChild(overlay);
  selectionHandler = event => {
    if (!(event.target instanceof Element)) return;
    const candidate = event.target.closest(EDITOR_SELECTOR);
    if (!candidate) return;
    targetSelector = EDITOR_SELECTOR;
    selectedPath = location.origin + location.pathname;
    const target = resolveTarget();
    if (!target || target.editor !== candidate) {
      targetSelector = null;
      selectedPath = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cleanupSelection();
  };
  escapeHandler = event => {
    if (event.key === 'Escape') cleanupSelection();
  };
  document.addEventListener('click', selectionHandler, true);
  document.addEventListener('keydown', escapeHandler, true);
}

function validInterval(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 86400;
}

function configuredMessages(settings) {
  if (settings.mode === 'preset' && typeof settings.presetMessages === 'string') {
    return settings.presetMessages.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  }
  if (settings.mode === 'single' && typeof settings.singleMessage === 'string') {
    return [settings.singleMessage.trim()];
  }
  if (settings.mode === 'emoji' && typeof settings.emoji === 'string') {
    return [settings.emoji.trim()];
  }
  return [];
}

function startBot(settings) {
  stopBot();
  if (!settings || !validInterval(settings.minInterval) || !validInterval(settings.maxInterval) || settings.minInterval > settings.maxInterval) {
    lastError = 'Intervals must be integers from 1 to 86400 seconds, min <= max.';
    return 'ERROR';
  }
  if (!resolveTarget()) {
    lastError = 'Chat target is missing or ambiguous.';
    return 'NO_TARGET';
  }
  const messages = configuredMessages(settings);
  if (!messages.length || messages.some(value => !value)) {
    lastError = 'No valid messages configured.';
    return 'ERROR';
  }
  let emote = null;
  if (settings.mode === 'emoji') {
    const match = typeof settings.emojiUrl === 'string' && /^https:\/\/files\.kick\.com\/emotes\/([1-9]\d*)\/fullsize$/.exec(settings.emojiUrl);
    if (!match) {
      lastError = 'No valid emote asset configured; reload the updated extension.';
      return 'ERROR';
    }
    emote = { id: match[1], url: settings.emojiUrl };
  }
  isRunning = true;
  const token = generation;
  let index = 0;
  const loop = () => {
    const target = resolveTarget();
    if (!target) return stopBot('Chat target became invalid.');
    const { editor, footer } = target;
    if (!sendControl(footer)) return stopBot('Exact chat send button is missing or ambiguous.');
    if (hasDraft(editor)) return stopBot('Chat contains a draft; nothing was overwritten.');
    const text = messages[settings.isSequential ? index++ % messages.length : Math.floor(Math.random() * messages.length)];
    try {
      editor.focus();
      if (!isRunning || generation !== token) return;
      if (resolveTarget()?.editor !== editor || hasDraft(editor)) return stopBot('Chat changed before writing.');
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, text); } catch { inserted = false; }
      if (!inserted) {
        editor.textContent = text;
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      if (!isRunning || generation !== token) return;
      const interrupt = () => stopBot('Chat input changed during pending send; no click was issued.');
      editor.addEventListener('beforeinput', interrupt);
      editor.addEventListener('input', interrupt);
      cleanupPendingInput = () => {
        editor.removeEventListener('beforeinput', interrupt);
        editor.removeEventListener('input', interrupt);
      };
      let attempts = 0;
      const ready = () => {
        const current = resolveTarget();
        if (!current || current.editor !== editor || current.footer !== footer || !matchesMessage(editor, text, emote)) return stopBot('Chat changed before send; no click was issued.');
        const button = sendControl(footer);
        if (!button) return stopBot('Exact chat send button is missing or ambiguous.');
        if (button.disabled || button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true') {
          if (++attempts >= 10) return stopBot('Chat send button remained disabled.');
          later(ready, 100, token);
          return;
        }
        cleanupPendingInput?.();
        cleanupPendingInput = null;
        try { button.click(); } catch { return stopBot('Unable to click the chat send control.'); }
        if (!isRunning || generation !== token) return;
        const delay = (settings.minInterval + Math.floor(Math.random() * (settings.maxInterval - settings.minInterval + 1))) * 1000;
        later(loop, delay, token);
      };
      later(ready, 150, token);
    } catch {
      stopBot('Unable to write or click the chat control.');
    }
  };
  later(loop, 500, token);
  return 'STARTED';
}

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  switch (request.action) {
    case 'GET_STATUS': respond({ isRunning, hasTarget: !!resolveTarget(), lastError }); break;
    case 'SELECT_TARGET': selectTargetMode(); respond({ status: 'SELECTING' }); break;
    case 'RESET_TARGET': stopBot(); targetSelector = null; selectedPath = null; respond({ status: 'RESET_COMPLETE' }); break;
    case 'STOP': stopBot(); respond({ status: 'STOPPED' }); break;
    case 'START': respond({ status: startBot(request.settings), lastError }); break;
  }
});
