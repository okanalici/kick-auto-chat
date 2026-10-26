document.addEventListener('DOMContentLoaded', () => {
  const byId = id => document.getElementById(id);
  const status = byId('status');
  const text = byId('message-list');
  const min = byId('min-time');
  const max = byId('max-time');
  const sequential = byId('sequential-check');
  const emojis = __KICK_EMOJIS__;
  let mode = 'preset';
  let selectedEmoji = emojis[0]?.name || '';
  let presetMessages = 'W Streamer\nGG!\nL Take';
  let singleMessage = 'W Streamer';
  let pollId = null;
  let localError = null;
  let connectionError = null;
  let remoteStatus = null;
  let preferencesReady = false;
  let pendingStart = false;
  let actionGeneration = 0;
  let activeReader = null;
  function cancelImport() {
    const reader = activeReader;
    activeReader = null;
    if (reader) reader.abort();
  }
  function renderControls() {
    document.querySelectorAll('.tab, .emoji-btn, #message-list, #min-time, #max-time, #sequential-check, #file-btn, #file-upload').forEach(control => {
      control.disabled = !preferencesReady;
    });
    byId('btn-start').disabled = !preferencesReady || !remoteStatus || remoteStatus.isRunning || !!connectionError || pendingStart;
    byId('btn-start').style.display = remoteStatus?.isRunning ? 'none' : 'block';
    byId('btn-stop').style.display = remoteStatus?.isRunning || pendingStart ? 'block' : 'none';
  }
  function renderMessage() {
    const failure = localError || connectionError || remoteStatus?.lastError;
    status.style.color = failure ? '#ff4444' : '#53fc18';
    status.textContent = failure || (remoteStatus?.isRunning ? 'Running (click requests only; delivery unconfirmed)' : remoteStatus?.hasTarget ? 'Ready to start' : 'Waiting for target...');
    renderControls();
  }
  const error = message => {
    localError = message;
    renderMessage();
  };
  function clearError() {
    localError = null;
    renderMessage();
  }
  function save(values, complete = () => {}, generation) {
    chrome.storage.local.set(values, () => {
      if (generation !== undefined && generation !== actionGeneration) return;
      if (chrome.runtime.lastError) {
        if (generation !== undefined) pendingStart = false;
        error('Settings storage failed: ' + chrome.runtime.lastError.message);
      } else complete();
    });
  }
  function beginAction() {
    cancelImport();
    actionGeneration++;
    pendingStart = false;
    clearTimeout(pollId);
    renderControls();
    scheduleStatus();
    return actionGeneration;
  }
  function scheduleStatus() {
    if (pollId) clearTimeout(pollId);
    pollId = setTimeout(() => message('GET_STATUS', undefined, renderStatus), 1000);
  }
  function message(action, settings, complete = () => {}, generation = actionGeneration) {
    const failed = reason => {
      if (generation !== actionGeneration) return;
      if (action === 'START') pendingStart = false;
      if (action === 'GET_STATUS') connectionError = reason;
      else error(reason);
      byId('error-overlay').style.display = 'block';
      renderMessage();
      if (action === 'GET_STATUS') scheduleStatus();
    };
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (generation !== actionGeneration) return;
      if (chrome.runtime.lastError || !tabs?.[0]?.id) return failed('No accessible active tab.');
      chrome.tabs.sendMessage(tabs[0].id, { action, settings }, response => {
        if (generation !== actionGeneration) return;
        if (chrome.runtime.lastError || !response) return failed('Connection failed; refresh Kick.com.');
        connectionError = null;
        byId('error-overlay').style.display = 'none';
        renderMessage();
        complete(response);
      });
    });
  }
  function renderStatus(response) {
    byId('selection-group').style.display = response.hasTarget ? 'none' : 'block';
    byId('target-display').style.display = response.hasTarget ? 'flex' : 'none';
    remoteStatus = response;
    renderMessage();
    scheduleStatus();
  }
  function renderMode() {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
    byId('input-container').style.display = mode === 'preset' ? 'flex' : 'none';
    byId('sequential-row').style.display = mode === 'preset' ? 'flex' : 'none';
    text.style.display = mode === 'emoji' ? 'none' : 'block';
    byId('emoji-grid').style.display = mode === 'emoji' ? 'grid' : 'none';
    text.value = mode === 'single' ? singleMessage : presetMessages;
    document.querySelectorAll('.emoji-btn').forEach(button => {
      const selected = button.dataset.name === selectedEmoji;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  emojis.forEach(emoji => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emoji-btn';
    button.dataset.name = emoji.name;
    button.title = emoji.name;
    const image = document.createElement('img');
    image.src = emoji.url;
    image.alt = emoji.name;
    image.loading = 'lazy';
    button.appendChild(image);
    button.addEventListener('click', () => {
      selectedEmoji = emoji.name;
      renderMode();
      save({ selectedEmoji });
    });
    byId('emoji-grid').appendChild(button);
  });
  renderMode();
  renderControls();
  chrome.storage.local.get(['presetMessages', 'singleMessage', 'minTime', 'maxTime', 'mode', 'selectedEmoji', 'isSequential'], values => {
    preferencesReady = true;
    if (chrome.runtime.lastError) return error('Settings storage read failed: ' + chrome.runtime.lastError.message);
    if (typeof values.presetMessages === 'string') presetMessages = values.presetMessages;
    if (typeof values.singleMessage === 'string') singleMessage = values.singleMessage;
    if (values.minTime !== undefined) min.value = values.minTime;
    if (values.maxTime !== undefined) max.value = values.maxTime;
    if (['preset', 'single', 'emoji'].includes(values.mode)) mode = values.mode;
    if (emojis.some(emoji => emoji.name === values.selectedEmoji)) selectedEmoji = values.selectedEmoji;
    sequential.checked = values.isSequential === true;
    renderMode();
    renderControls();
  });
  message('GET_STATUS', undefined, renderStatus);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    renderMode();
    save({ mode });
  }));
  text.addEventListener('input', () => {
    if (mode === 'preset') { presetMessages = text.value; save({ presetMessages }); }
    else if (mode === 'single') { singleMessage = text.value; save({ singleMessage }); }
  });
  sequential.addEventListener('change', () => save({ isSequential: sequential.checked }));
  byId('file-btn').addEventListener('click', () => byId('file-upload').click());
  byId('file-upload').addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.txt$/i.test(file.name) || file.size > 1024 * 1024) return error('Import a .txt file no larger than 1 MiB.');
    const generation = actionGeneration;
    const reader = new FileReader();
    activeReader = reader;
    reader.onerror = () => {
      if (activeReader !== reader || generation !== actionGeneration) return;
      activeReader = null;
      error('Unable to read imported file.');
    };
    reader.onload = () => {
      if (activeReader !== reader || generation !== actionGeneration) return;
      activeReader = null;
      presetMessages = String(reader.result);
      renderMode();
      save({ presetMessages });
    };
    try {
      reader.readAsText(file);
    } catch {
      reader.onerror();
    }
  });
  byId('btn-select').addEventListener('click', () => message('SELECT_TARGET', undefined, () => window.close(), beginAction()));
  byId('btn-reset').addEventListener('click', () => message('RESET_TARGET', undefined, () => {
    save({ isRunning: false });
    message('GET_STATUS', undefined, renderStatus);
  }, beginAction()));
  byId('btn-stop').addEventListener('click', () => message('STOP', undefined, () => {
    save({ isRunning: false });
    message('GET_STATUS', undefined, renderStatus);
  }, beginAction()));
  byId('btn-start').addEventListener('click', () => {
    if (!preferencesReady || !remoteStatus || connectionError || pendingStart) return;
    const generation = beginAction();
    const minInterval = Number(min.value);
    const maxInterval = Number(max.value);
    if (!Number.isInteger(minInterval) || !Number.isInteger(maxInterval) || minInterval < 1 || maxInterval > 86400 || minInterval > maxInterval) return error('Intervals must be integers from 1 to 86400 seconds, min <= max.');
    if (mode !== 'emoji' && !(mode === 'single' ? singleMessage : presetMessages).trim()) return error('Please enter messages.');
    const settings = { mode, presetMessages, singleMessage, emoji: selectedEmoji, emojiUrl: emojis.find(emoji => emoji.name === selectedEmoji)?.url, minInterval, maxInterval, isSequential: sequential.checked };
    pendingStart = true;
    renderControls();
    save({ presetMessages, singleMessage, mode, selectedEmoji, minTime: minInterval, maxTime: maxInterval, isSequential: sequential.checked }, () => {
      message('START', settings, response => {
        pendingStart = false;
        renderControls();
        if (response.status !== 'STARTED') return error(response.lastError || 'Chat target not found.');
        beginAction();
        remoteStatus = { ...remoteStatus, isRunning: true };
        renderMessage();
        save({ isRunning: true });
        message('GET_STATUS', undefined, renderStatus);
      }, generation);
    }, generation);
  });
  function editPreferences() {
    beginAction();
    clearError();
  }
  document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    if (button.matches('.tab, .emoji-btn, #file-btn')) beginAction();
    clearError();
  }, true));
  [text, min, max].forEach(input => input.addEventListener('input', editPreferences, true));
  [sequential, byId('file-upload')].forEach(input => input.addEventListener('change', editPreferences, true));
  window.addEventListener('unload', () => {
    cancelImport();
    actionGeneration++;
    clearTimeout(pollId);
  });
});
