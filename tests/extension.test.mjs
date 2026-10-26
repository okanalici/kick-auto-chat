import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const content = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');
const layout = '<input id="search"><div id="channel-chatroom"><div id="chatroom-footer"><div id="chat-input-wrapper"><div data-input="true" enterkeyhint="send" class="editor-input" contenteditable="true" data-testid="chat-input" role="textbox" data-lexical-editor="true"></div></div><button id="points" type="submit">Channel points</button><button id="badge">Identity</button><button id="smile">Smile</button><button id="settings">Settings</button><button id="send-message-button">Gönder</button></div></div>';
const settings = { mode: 'single', singleMessage: 'Hello', minInterval: 1, maxInterval: 1 };

function harness(source = content) {
  const dom = new JSDOM(layout, { runScripts: 'outside-only', url: 'https://kick.com/example' });
  const { window } = dom;
  let receive;
  let now = 0;
  let serial = 0;
  const timers = new Map();
  const clicks = [];
  const keys = [];
  let inputs = 0;
  window.chrome = { runtime: { onMessage: { addListener(callback) { receive = callback; } }, sendMessage() {} } };
  window.setTimeout = (callback, delay) => {
    const id = ++serial;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  window.document.addEventListener('click', event => { if (event.target.tagName === 'BUTTON') clicks.push(event.target.id); });
  window.document.addEventListener('keydown', event => keys.push(event.key));
  window.document.addEventListener('input', () => inputs++);
  vm.runInContext(source, dom.getInternalVMContext());
  function request(action, values) {
    let response;
    receive({ action, settings: values }, {}, result => { response = result; });
    return response;
  }
  function tick(milliseconds) {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  const editor = () => window.document.querySelector('[data-testid="chat-input"]');
  function select() { request('SELECT_TARGET'); editor().click(); }
  return { dom, window, request, tick, editor, select, clicks, keys, timers, inputs: () => inputs };
}

test('message parsing preserves mode selection, trimming, line filtering and sequential order', () => {
  for (const [values, expected] of [
    [{ mode: 'preset', presetMessages: ' first \r\n \n second\n', isSequential: true }, ['first', 'second', 'first']],
    [{ mode: 'single', singleMessage: '  one\n two  ' }, ['one\n two']],
    [{ mode: 'emoji', emoji: '  emojiAngel  ', emojiUrl: 'https://files.kick.com/emotes/1/fullsize' }, ['emojiAngel']],
    [{ mode: 'preset', presetMessages: '  one\rtwo  ' }, ['one\rtwo']],
  ]) {
    const h = harness();
    try {
      h.select();
      const sent = [];
      h.window.document.getElementById('send-message-button').addEventListener('click', () => {
        sent.push(h.editor().textContent);
        h.editor().textContent = '';
      });
      assert.equal(h.request('START', { ...settings, presetMessages: 'ignored', emoji: 'ignored', ...values }).status, 'STARTED');
      h.tick(expected.length === 3 ? 2950 : 650);
      assert.deepEqual(sent, expected);
    } finally { h.dom.window.close(); }
  }
});

test('message validation rejects empty, non-string and unsupported mode inputs without fallback', () => {
  for (const values of [
    { mode: 'preset', presetMessages: ' \r\n\t\n' },
    { mode: 'preset', presetMessages: ['hello'] },
    { mode: 'single', singleMessage: ' \n ' },
    { mode: 'single', singleMessage: 42 },
    { mode: 'emoji', emoji: ' ' },
    { mode: 'emoji', emoji: null },
    { mode: 'unknown', presetMessages: 'hello', emoji: 'emojiAngel' },
    { mode: undefined },
  ]) {
    const h = harness();
    try {
      h.select();
      assert.equal(h.request('START', { ...settings, ...values }).status, 'ERROR');
      h.tick(5000);
      assert.equal(h.inputs(), 0);
      assert.deepEqual(h.clicks, []);
      assert.equal(h.timers.size, 0);
    } finally { h.dom.window.close(); }
  }
});

function run(h) { h.select(); assert.equal(h.request('START', settings).status, 'STARTED'); }
function stopped(h) { assert.equal(h.request('GET_STATUS').isRunning, false); assert.ok(h.request('GET_STATUS').lastError); assert.equal(h.clicks.length, 0); }

test('baseline 715acd569c97aa815f3f97e5345790045101c5ae data/extensionFiles.ts evaluated content.js fixture clicks unrelated points submit', () => {
  const oldSource = readFileSync(new URL('./fixtures/legacy-content.js.txt', import.meta.url), 'utf8');
  const h = harness(oldSource);
  run(h);
  h.tick(650);
  assert.deepEqual(h.clicks, ['points']);
  h.dom.window.close();
});

test('localized current footer clicks only exact send, emits one input and no Enter', () => {
  const h = harness();
  run(h);
  h.tick(650);
  assert.deepEqual(h.clicks, ['send-message-button']);
  assert.equal(h.inputs(), 1);
  assert.deepEqual(h.keys, []);
  assert.equal(h.editor().textContent, 'Hello');
  h.tick(1000);
  assert.equal(h.request('GET_STATUS').isRunning, false);
  assert.deepEqual(h.clicks, ['send-message-button']);
});

for (const action of ['STOP', 'RESET_TARGET', 'SELECT_TARGET']) {
  test(action + ' cancels delayed send and readiness timers', () => {
    const h = harness();
    run(h);
    h.tick(500);
    h.request(action);
    h.tick(5000);
    assert.deepEqual(h.clicks, []);
    assert.equal(h.timers.size, 0);
  });
}

test('new start cancels previous generation without overwriting pending draft', () => {
  const h = harness();
  run(h); h.tick(500);
  h.request('START', settings); h.tick(5000);
  stopped(h);
  assert.equal(h.editor().textContent, 'Hello');
});

for (const state of ['missing', 'duplicate', 'wrong footer', 'disabled', 'aria-disabled', 'hidden']) {
  test('send control fails closed: ' + state, () => {
    const h = harness();
    const button = h.window.document.getElementById('send-message-button');
    if (state === 'missing') button.remove();
    if (state === 'duplicate') button.after(button.cloneNode(true));
    if (state === 'wrong footer') h.window.document.body.appendChild(button);
    if (state === 'disabled') button.disabled = true;
    if (state === 'aria-disabled') button.setAttribute('aria-disabled', 'true');
    if (state === 'hidden') button.style.display = 'none';
    run(h); h.tick(2000); stopped(h);
  });
}

test('bounded React readiness wait clicks once when exact button enables', () => {
  const h = harness();
  const button = h.window.document.getElementById('send-message-button');
  button.disabled = true;
  run(h); h.tick(650);
  assert.deepEqual(h.clicks, []);
  button.disabled = false;
  h.tick(100);
  assert.deepEqual(h.clicks, ['send-message-button']);
});

test('STOP cancels disabled readiness wait', () => {
  const h = harness();
  h.window.document.getElementById('send-message-button').disabled = true;
  run(h); h.tick(650); h.request('STOP');
  h.window.document.getElementById('send-message-button').disabled = false;
  h.tick(2000);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.timers.size, 0);
});

test('existing whitespace or text draft is never overwritten', () => {
  for (const draft of ['my draft', ' ']) {
    const h = harness(); h.editor().textContent = draft;
    run(h); h.tick(650); stopped(h);
    assert.equal(h.editor().textContent, draft);
    assert.equal(h.inputs(), 0);
  }
});

for (const change of ['removed', 'duplicate', 'hidden', 'outside footer', 'read-only', 'draft changed']) {
  test('revalidates target after write: ' + change, () => {
    const h = harness(); run(h); h.tick(500);
    const editor = h.editor();
    if (change === 'removed') editor.remove();
    if (change === 'duplicate') editor.after(editor.cloneNode(true));
    if (change === 'hidden') editor.parentElement.style.display = 'none';
    if (change === 'outside footer') h.window.document.body.appendChild(editor);
    if (change === 'read-only') editor.setAttribute('contenteditable', 'false');
    if (change === 'draft changed') editor.textContent = 'User edit';
    h.tick(150); stopped(h);
  });
}

test('rerender during pending send stops; between cycles canonical editor can recover', () => {
  const pending = harness(); run(pending); pending.tick(500);
  pending.editor().replaceWith(pending.editor().cloneNode(true));
  pending.tick(150); stopped(pending);
  const h = harness(); run(h); h.tick(650);
  const replacement = h.editor().cloneNode(false);
  h.editor().replaceWith(replacement);
  h.tick(1150);
  assert.deepEqual(h.clicks, ['send-message-button', 'send-message-button']);
});

test('selection ignores non-chat input without blocking page and Escape/reset clean up', () => {
  const h = harness();
  h.request('SELECT_TARGET'); h.request('SELECT_TARGET');
  const event = new h.window.MouseEvent('click', { bubbles: true, cancelable: true });
  h.window.document.getElementById('search').dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(h.request('GET_STATUS').hasTarget, false);
  h.window.document.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  h.editor().click();
  assert.equal(h.request('GET_STATUS').hasTarget, false);
  assert.equal(h.window.document.getElementById('kick-bot-overlay'), null);
  h.request('SELECT_TARGET'); h.request('RESET_TARGET'); h.editor().click();
  assert.equal(h.request('GET_STATUS').hasTarget, false);
  h.select();
  assert.equal(h.request('GET_STATUS').hasTarget, true);
});

for (const value of [0, -1, 1.5, 86401, NaN, Infinity, '30', undefined]) {
  test('rejects invalid interval ' + value, () => {
    const h = harness(); h.select();
    assert.equal(h.request('START', { ...settings, minInterval: value }).status, 'ERROR');
    assert.ok(h.request('GET_STATUS').lastError);
    h.tick(5000); assert.deepEqual(h.clicks, []);
  });
}

test('rejects reversed intervals, invalid modes and empty messages', () => {
  const h = harness(); h.select();
  for (const values of [{ minInterval: 3, maxInterval: 2 }, { mode: 'unknown' }, { singleMessage: '' }]) {
    assert.equal(h.request('START', { ...settings, ...values }).status, 'ERROR');
  }
});

test('Lexical deferred DOM commit is validated at send time, not synchronously', () => {
  const h = harness();
  h.editor().innerHTML = '<p class="editor-paragraph"><br></p>';
  h.window.document.execCommand = (command, ui, value) => {
    h.window.setTimeout(() => {
      const paragraph = h.window.document.createElement('p');
      const span = h.window.document.createElement('span');
      span.setAttribute('data-lexical-text', 'true');
      span.textContent = value;
      paragraph.appendChild(span);
      h.editor().replaceChildren(paragraph);
    }, 1);
    return true;
  };
  run(h);
  h.tick(500);
  assert.equal(h.editor().textContent, '');
  assert.equal(h.request('GET_STATUS').isRunning, true);
  h.tick(150);
  assert.equal(h.editor().textContent, 'Hello');
  assert.deepEqual(h.clicks, ['send-message-button']);
  assert.equal(h.inputs(), 0);
});

for (const action of ['STOP', 'RESET_TARGET']) {
  test(action + ' cancels send while Lexical DOM commit is pending', () => {
    const h = harness();
    h.window.document.execCommand = (command, ui, value) => {
      h.window.setTimeout(() => { h.editor().textContent = value; }, 1);
      return true;
    };
    run(h); h.tick(500);
    h.request(action);
    h.tick(2000);
    assert.deepEqual(h.clicks, []);
    assert.equal(h.request('GET_STATUS').isRunning, false);
    assert.equal(h.timers.size, 0);
  });
}

for (const event of ['beforeinput', 'input']) {
  test(event + ' during deferred DOM commit cancels send even with matching text', () => {
    const h = harness();
    h.window.document.execCommand = (command, ui, value) => {
      h.window.setTimeout(() => { h.editor().textContent = value; }, 1);
      return true;
    };
    run(h); h.tick(501);
    h.editor().dispatchEvent(new h.window.InputEvent(event, { bubbles: true }));
    h.tick(2000);
    stopped(h);
  });
}

for (const commit of ['missing', 'different', 'late']) {
  test('deferred DOM commit fails closed when ' + commit, () => {
    const h = harness();
    h.window.document.execCommand = (command, ui, value) => {
      if (commit !== 'missing') h.window.setTimeout(() => {
        h.editor().textContent = commit === 'different' ? 'Other text' : value;
      }, commit === 'late' ? 200 : 1);
      return true;
    };
    run(h); h.tick(2000);
    stopped(h);
  });
}

const emoteSettings = { ...settings, mode: 'emoji', emoji: 'emojiAngel', emojiUrl: 'https://files.kick.com/emotes/1730752/fullsize' };
const emoteMarkup = '<p class="editor-paragraph"><div class="editor-custom-node" data-lexical-decorator="true" contenteditable="false"><img class="mx-px inline h-5 w-5" alt="emojiAngel" data-emote-id="1730752" data-emote-name="emojiAngel" src="https://files.kick.com/emotes/1730752/fullsize"></div><span data-lexical-text="true"> </span></p>';

function runEmote(h, markup = emoteMarkup) {
  h.window.document.execCommand = () => {
    h.window.setTimeout(() => {
      const container = h.window.document.createElement('div');
      container.innerHTML = markup.replace('<p class="editor-paragraph">', '').replace('</p>', '');
      const paragraph = h.window.document.createElement('p');
      paragraph.className = 'editor-paragraph';
      paragraph.append(...container.childNodes);
      h.editor().replaceChildren(paragraph);
    }, 1);
    return true;
  };
  h.select();
  assert.equal(h.request('START', emoteSettings).status, 'STARTED');
}

test('Kick 2026-10-04 emote decorator conversion sends only the exact emote', () => {
  const h = harness();
  runEmote(h); h.tick(650);
  assert.deepEqual(h.clicks, ['send-message-button']);
  assert.equal(h.request('GET_STATUS').isRunning, true);
});

for (const extra of [false, true]) {
  test('emoji unconverted exact text ' + (extra ? 'rejects decorator' : 'can send'), () => {
    const h = harness();
    h.window.document.execCommand = (command, ui, value) => {
      h.editor().textContent = value;
      if (extra) {
        const node = h.window.document.createElement('span');
        node.setAttribute('contenteditable', 'false');
        h.editor().appendChild(node);
      }
      return true;
    };
    h.select();
    assert.equal(h.request('START', emoteSettings).status, 'STARTED');
    h.tick(650);
    if (extra) stopped(h);
    else assert.deepEqual(h.clicks, ['send-message-button']);
  });
}

for (const mutation of ['wrong name', 'wrong id', 'wrong source', 'extra text', 'extra emote', 'missing decorator', 'unknown node']) {
  test('emote validation rejects ' + mutation, () => {
    const h = harness();
    let markup = emoteMarkup;
    if (mutation === 'wrong name') markup = markup.replace('data-emote-name="emojiAngel"', 'data-emote-name="emojiAngry"');
    if (mutation === 'wrong id') markup = markup.replace('data-emote-id="1730752"', 'data-emote-id="1730753"');
    if (mutation === 'wrong source') markup = markup.replace('/1730752/fullsize', '/1730753/fullsize');
    if (mutation === 'extra text') markup += '<span>unexpected</span>';
    if (mutation === 'extra emote') markup += emoteMarkup;
    if (mutation === 'missing decorator') markup = markup.replace('data-lexical-decorator="true"', 'data-lexical-decorator="false"');
    if (mutation === 'unknown node') markup += '<button></button>';
    runEmote(h, markup); h.tick(2000); stopped(h);
  });
}

for (const action of ['STOP', 'RESET_TARGET', 'SELECT_TARGET', 'beforeinput', 'input']) {
  test('emote pending send is cancelled by ' + action, () => {
    const h = harness(); runEmote(h); h.tick(501);
    if (action === 'input' || action === 'beforeinput') h.editor().dispatchEvent(new h.window.InputEvent(action, { bubbles: true }));
    else h.request(action);
    h.tick(2000);
    assert.deepEqual(h.clicks, []);
    assert.equal(h.timers.size, 0);
    assert.equal(h.request('GET_STATUS').isRunning, false);
  });
}

for (const mutation of ['sibling span', 'sibling br', 'sibling paragraph', 'duplicate trailing span', 'direct decorator', 'decorator attribute', 'image attribute', 'nonempty span']) {
  test('emote tree rejects unexpected structure: ' + mutation, () => {
    const h = harness(); runEmote(h); h.tick(501);
    const editor = h.editor();
    const paragraph = editor.firstElementChild;
    const decorator = paragraph.firstElementChild;
    if (mutation.startsWith('sibling ')) {
      const tag = mutation === 'sibling span' ? 'span' : mutation === 'sibling br' ? 'br' : 'p';
      const node = h.window.document.createElement(tag);
      if (tag === 'span') node.setAttribute('data-lexical-text', 'true');
      if (tag === 'p') node.className = 'editor-paragraph';
      editor.appendChild(node);
    }
    if (mutation === 'duplicate trailing span') paragraph.appendChild(paragraph.lastElementChild.cloneNode(true));
    if (mutation === 'direct decorator') editor.replaceChildren(decorator);
    if (mutation === 'decorator attribute') decorator.setAttribute('data-unexpected', 'true');
    if (mutation === 'image attribute') decorator.firstElementChild.setAttribute('data-unexpected', 'true');
    if (mutation === 'nonempty span') paragraph.lastElementChild.textContent = 'unexpected';
    h.tick(150); stopped(h);
  });
}

test('existing emote-only draft without text is not overwritten', () => {
  const h = harness();
  h.editor().innerHTML = emoteMarkup.replace('<span data-lexical-text="true"> </span>', '');
  const original = h.editor().innerHTML;
  run(h); h.tick(650); stopped(h);
  assert.equal(h.editor().innerHTML, original);
  assert.equal(h.inputs(), 0);
});

test('single text mode never treats an emote decorator as matching text', () => {
  const h = harness(); runEmote(h);
  h.request('START', { ...settings, singleMessage: 'emojiAngel' });
  h.tick(650); stopped(h);
});

test('emoji mode rejects missing or noncanonical asset identity', () => {
  const h = harness(); h.select();
  for (const emojiUrl of [undefined, 'https://example.com/emotes/1730752/fullsize', 'https://files.kick.com/emotes/1730752/fullsize?x=1']) {
    assert.equal(h.request('START', { ...emoteSettings, emojiUrl }).status, 'ERROR');
  }
});

test('execCommand input flow does not insert twice and mismatched writes stop', () => {
  const h = harness();
  h.window.document.execCommand = (command, ui, value) => {
    h.editor().textContent = value;
    h.editor().dispatchEvent(new h.window.InputEvent('input', { bubbles: true }));
    return true;
  };
  run(h); h.tick(650);
  assert.equal(h.inputs(), 1); assert.deepEqual(h.clicks, ['send-message-button']);
  const broken = harness();
  broken.window.document.execCommand = () => true;
  run(broken); broken.tick(650); stopped(broken);
});

for (const state of ['readOnly', 'aria-readonly']) {
  test('readonly editor is rejected before write: ' + state, () => {
    const h = harness(); run(h);
    if (state === 'readOnly') h.editor().readOnly = true;
    else h.editor().setAttribute('aria-readonly', 'true');
    h.tick(650); stopped(h);
    assert.equal(h.editor().textContent, '');
    assert.equal(h.inputs(), 0);
  });
}

for (const eventType of ['beforeinput', 'input']) {
  test('same-text user ' + eventType + ' during pending send cancels click', () => {
    const h = harness(); run(h); h.tick(500);
    h.editor().dispatchEvent(new h.window.InputEvent(eventType, { bubbles: true, inputType: 'insertText', data: 'Hello' }));
    h.tick(150); stopped(h);
    assert.equal(h.editor().textContent, 'Hello');
  });
}

test('STOP removes pending input listeners so a later draft cannot change stopped status', () => {
  const h = harness(); run(h); h.tick(500); h.request('STOP');
  h.editor().dispatchEvent(new h.window.InputEvent('input', { bubbles: true }));
  assert.equal(h.request('GET_STATUS').lastError, null);
  h.tick(2000); assert.deepEqual(h.clicks, []);
});

function popupHarness(storageError = false, remoteError = 'Chat send button remained disabled.', options = {}) {
  const html = readFileSync(new URL('../extension/popup.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8').replace('__KICK_EMOJIS__', '[{"name":"emojiAngel","url":"https://files.kick.com/emotes/1730752/fullsize"},{"name":"emojiSecond","url":"https://example.test/second.png"}]');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const requests = [];
  const runtime = {};
  const pending = { get: [], set: [], query: [], message: [] };
  const writes = [];
  function deliver(kind, callback) {
    if (options.delay?.[kind]) pending[kind].push(callback);
    else callback();
  }
  function flush(kind, index = 0) {
    assert.ok(pending[kind][index], 'Expected pending ' + kind + ' callback');
    pending[kind].splice(index, 1)[0]();
  }
  let now = 0;
  let serial = 0;
  const timers = new Map();
  dom.window.setTimeout = (callback, delay) => {
    const id = ++serial;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  dom.window.clearTimeout = id => timers.delete(id);
  function tick(milliseconds) {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  dom.window.chrome = {
    runtime,
    storage: { local: {
      get(keys, callback) {
        deliver('get', () => {
          runtime.lastError = options.readError ? { message: 'read failed' } : undefined;
          callback(options.values || {});
          runtime.lastError = undefined;
        });
      },
      set(values, callback) {
        writes.push(values);
        deliver('set', () => {
          runtime.lastError = storageError ? { message: 'disk failed' } : undefined;
          callback();
          runtime.lastError = undefined;
        });
      }
    } },
    tabs: {
      query(queryOptions, callback) {
        deliver('query', () => {
          if (options.queryFailures > 0) {
            options.queryFailures--;
            callback([]);
          } else callback([{ id: 1 }]);
        });
      },
      sendMessage(id, request, callback) {
        requests.push(request);
        deliver('message', () => {
          if (options.failActions?.includes(request.action) || (request.action === 'GET_STATUS' && options.statusFailures > 0)) {
            if (request.action === 'GET_STATUS') options.statusFailures--;
            runtime.lastError = { message: 'connection unavailable' };
            callback();
            runtime.lastError = undefined;
            return;
          }
          callback(request.action === 'START' ? { status: 'STARTED' } : { hasTarget: true, isRunning: options.running === true, lastError: remoteError });
        });
      }
    }
  };
  vm.runInContext(source, dom.getInternalVMContext());
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return { dom, requests, writes, pending, flush, tick, document: dom.window.document };
}

test('popup hydration locks preferences and START but leaves running STOP independent', () => {
  const options = { delay: { get: true }, running: true, values: { singleMessage: 'Saved', mode: 'single', minTime: 7 } };
  const h = popupHarness(false, null, options);
  for (const selector of ['#message-list', '#min-time', '#max-time', '#sequential-check', '.tab', '#file-btn', '#file-upload', '.emoji-btn', '#btn-start']) {
    assert.equal(h.document.querySelector(selector).disabled, true, selector);
  }
  h.document.querySelector('[data-mode="single"]').click();
  h.document.getElementById('btn-start').click();
  assert.equal(h.writes.length, 0);
  assert.equal(h.document.getElementById('btn-stop').disabled, false);
  h.document.getElementById('btn-stop').click();
  assert.equal(h.requests.filter(request => request.action === 'STOP').length, 1);
  h.flush('get');
  assert.equal(h.document.getElementById('message-list').value, 'Saved');
  assert.equal(h.document.getElementById('min-time').value, '7');
  assert.equal(h.document.getElementById('message-list').disabled, false);
  h.dom.window.close();
});

test('popup stopped status cannot enable START before preference hydration settles', () => {
  const h = popupHarness(false, null, { delay: { get: true } });
  assert.equal(h.requests.filter(request => request.action === 'GET_STATUS').length, 1);
  assert.equal(h.document.getElementById('btn-stop').style.display, 'none');
  assert.equal(h.document.getElementById('btn-start').disabled, true);
  h.document.getElementById('btn-start').click();
  assert.equal(h.writes.length, 0);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 0);
  h.flush('get');
  assert.equal(h.document.getElementById('btn-start').disabled, false);
  h.dom.window.close();
});

for (const nextAction of ['tab', 'STOP']) {
  test('popup delayed ordinary preference storage error survives later ' + nextAction, () => {
    const h = popupHarness(true, null, { delay: { set: true } });
    const input = h.document.getElementById('message-list');
    input.value = 'Edited message';
    input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
    h.document.querySelector(nextAction === 'tab' ? '[data-mode="single"]' : '#btn-stop').click();
    h.flush('set');
    assert.match(h.document.getElementById('status').textContent, /Settings storage failed: disk failed/);
    h.tick(1000);
    assert.match(h.document.getElementById('status').textContent, /Settings storage failed: disk failed/);
    h.dom.window.close();
  });
}

test('popup unrelated preference storage failure does not unlock pending START', () => {
  const h = popupHarness(true, null, { delay: { set: true } });
  const input = h.document.getElementById('message-list');
  input.value = 'Edited message';
  input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
  h.document.getElementById('btn-start').click();
  h.flush('set');
  assert.match(h.document.getElementById('status').textContent, /Settings storage failed/);
  assert.equal(h.document.getElementById('btn-start').disabled, true);
  h.document.getElementById('btn-start').click();
  assert.equal(h.writes.length, 2);
  h.dom.window.close();
});

test('popup STOP discards a cancelled START storage failure', () => {
  const h = popupHarness(true, null, { delay: { set: true } });
  h.document.getElementById('btn-start').click();
  h.document.getElementById('btn-stop').click();
  h.flush('set');
  assert.doesNotMatch(h.document.getElementById('status').textContent, /Settings storage failed/);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 0);
  h.dom.window.close();
});

test('popup prevents duplicate START after storage completes while acknowledgement is pending', () => {
  const options = { delay: { set: true } };
  const h = popupHarness(false, null, options);
  h.document.getElementById('btn-start').click();
  options.delay.message = true;
  h.flush('set');
  h.document.getElementById('btn-start').click();
  assert.equal(h.writes.length, 1);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 1);
  assert.equal(h.pending.message.length, 1);
  assert.equal(h.document.getElementById('btn-start').disabled, true);
  h.dom.window.close();
});

test('popup START waits for successful engine status and storage failure still unlocks preferences', () => {
  const h = popupHarness(false, null, { readError: true, statusFailures: 1 });
  assert.equal(h.document.getElementById('message-list').disabled, false);
  h.document.getElementById('btn-start').click();
  assert.equal(h.requests.filter(request => request.action === 'START').length, 0);
  h.tick(1000);
  assert.equal(h.document.getElementById('btn-start').disabled, false);
  assert.match(h.document.getElementById('status').textContent, /Settings storage read failed/);
  h.dom.window.close();
});

for (const action of ['STOP', 'RESET_TARGET', 'SELECT_TARGET']) {
  test('popup ' + action + ' cancels delayed START storage completion and duplicate clicks', () => {
    const h = popupHarness(false, null, { delay: { set: true } });
    h.document.getElementById('btn-start').click();
    h.document.getElementById('btn-start').click();
    assert.equal(h.writes.length, 1);
    h.document.getElementById({ STOP: 'btn-stop', RESET_TARGET: 'btn-reset', SELECT_TARGET: 'btn-select' }[action]).click();
    h.flush('set');
    assert.deepEqual(h.requests.filter(request => request.action !== 'GET_STATUS').map(request => request.action), [action]);
    h.dom.window.close();
  });
}

test('popup preference edit cancels pending START and ignores its late storage error', () => {
  const h = popupHarness(true, null, { delay: { set: true } });
  h.document.getElementById('btn-start').click();
  const input = h.document.getElementById('min-time');
  input.value = '9';
  input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
  const status = h.document.getElementById('status').textContent;
  h.flush('set');
  assert.equal(h.document.getElementById('status').textContent, status);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 0);
  assert.equal(h.document.getElementById('btn-start').disabled, false);
  h.dom.window.close();
});

test('popup delayed START tab query cannot deliver after STOP', () => {
  const options = { delay: {} };
  const h = popupHarness(false, null, options);
  options.delay.query = true;
  h.document.getElementById('btn-start').click();
  h.document.getElementById('btn-stop').click();
  h.flush('query', 1);
  h.flush('query', 0);
  assert.deepEqual(h.requests.filter(request => request.action !== 'GET_STATUS').map(request => request.action), ['STOP']);
  h.dom.window.close();
});

for (const failed of [false, true]) {
  test('popup ignores stale START response ' + (failed ? 'failure' : 'success') + ' after STOP', () => {
    const options = { delay: {} };
    const h = popupHarness(false, null, options);
    options.delay.message = true;
    h.document.getElementById('btn-start').click();
    h.document.getElementById('btn-stop').click();
    h.flush('message', 1);
    h.flush('message', 1);
    const status = h.document.getElementById('status').textContent;
    if (failed) options.failActions = ['START'];
    h.flush('message');
    assert.equal(h.document.getElementById('status').textContent, status);
    assert.equal(h.writes.some(values => values.isRunning === true), false);
    assert.equal(h.pending.message.length, 0);
    h.dom.window.close();
  });
}

test('popup successful START stays unavailable while refreshed engine status is pending', () => {
  const options = { delay: {} };
  const h = popupHarness(false, null, options);
  options.delay.message = true;
  h.document.getElementById('btn-start').click();
  h.flush('message');
  h.document.getElementById('btn-start').click();
  assert.equal(h.document.getElementById('btn-start').disabled, true);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 1);
  assert.equal(h.document.getElementById('btn-stop').style.display, 'block');
  h.dom.window.close();
});

test('popup stale status query cannot replace newer STOP status', () => {
  const options = { delay: { message: true }, running: true };
  const h = popupHarness(false, null, options);
  h.document.getElementById('btn-stop').click();
  h.flush('message', 1);
  options.running = false;
  h.flush('message', 1);
  options.running = true;
  h.flush('message');
  assert.equal(h.document.getElementById('btn-stop').style.display, 'none');
  assert.equal(h.document.getElementById('btn-start').style.display, 'block');
  h.dom.window.close();
});

function controlledPopupImports(h, failRead = false) {
  const readers = [];
  h.dom.window.FileReader = class {
    constructor() {
      this.aborted = false;
      readers.push(this);
    }
    readAsText() { if (failRead) throw new Error('read failed'); }
    abort() { this.aborted = true; }
    load(value) { this.result = value; this.onload(); }
    fail() { this.onerror(); }
  };
  const input = h.document.getElementById('file-upload');
  const select = (file = { name: 'messages.txt', size: 10 }) => {
    Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
    input.dispatchEvent(new h.dom.window.Event('change', { bubbles: true }));
  };
  return { readers, select };
}

test('popup newest import wins reversed completion and ignores stale read errors', () => {
  const h = popupHarness(false, null);
  const { readers, select } = controlledPopupImports(h);
  select();
  select();
  readers[0].fail();
  assert.doesNotMatch(h.document.getElementById('status').textContent, /Unable to read/);
  readers[1].load('Newest import');
  readers[0].load('Obsolete import');
  assert.equal(h.document.getElementById('message-list').value, 'Newest import');
  readers[0].fail();
  h.tick(1000);
  assert.doesNotMatch(h.document.getElementById('status').textContent, /Unable to read/);
  assert.equal(readers[0].aborted, true);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].presetMessages, 'Newest import');
  assert.deepEqual(Object.keys(h.writes[0]), ['presetMessages']);
  h.dom.window.close();
});

for (const action of ['text', 'mode', 'min', 'max', 'sequential', 'emoji', 'unload']) {
  test('popup pending import cannot overwrite newer ' + action + ' decision', () => {
    const h = popupHarness(false, null, { values: { singleMessage: 'Single saved' } });
    const { readers, select } = controlledPopupImports(h);
    select();
    const text = h.document.getElementById('message-list');
    if (action === 'text') {
      text.value = 'Manual text';
      text.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
    } else if (action === 'mode') h.document.querySelector('[data-mode="single"]').click();
    else if (action === 'emoji') h.document.querySelectorAll('.emoji-btn')[1].click();
    else if (action === 'unload') h.dom.window.dispatchEvent(new h.dom.window.Event('unload'));
    else {
      const input = h.document.getElementById(action === 'sequential' ? 'sequential-check' : action + '-time');
      input.dispatchEvent(new h.dom.window.Event(action === 'sequential' ? 'change' : 'input', { bubbles: true }));
    }
    const expectedText = text.value;
    const writeCount = h.writes.length;
    readers[0].load('Obsolete import');
    readers[0].fail();
    assert.equal(text.value, expectedText);
    assert.equal(h.writes.length, writeCount);
    assert.equal(readers[0].aborted, true);
    assert.doesNotMatch(h.document.getElementById('status').textContent, /Unable to read/);
    if (action === 'mode') {
      assert.equal(text.value, 'Single saved');
      h.document.querySelector('[data-mode="preset"]').click();
      assert.equal(text.value, 'W Streamer\nGG!\nL Take');
    }
    h.dom.window.close();
  });
}

for (const file of [{ name: 'invalid.csv', size: 10 }, { name: 'huge.txt', size: 1048577 }, null]) {
  test('popup invalid or empty selection supersedes pending import: ' + (file?.name || 'empty'), () => {
    const h = popupHarness(false, null);
    const { readers, select } = controlledPopupImports(h);
    select();
    select(file);
    const status = h.document.getElementById('status').textContent;
    readers[0].load('Obsolete import');
    readers[0].fail();
    assert.equal(h.document.getElementById('message-list').value, 'W Streamer\nGG!\nL Take');
    assert.equal(h.document.getElementById('status').textContent, status);
    assert.equal(h.writes.length, 0);
    assert.equal(readers[0].aborted, true);
    assert.equal(readers.length, 1);
    h.dom.window.close();
  });
}

test('popup synchronous import read failure remains visible through status polling', () => {
  const h = popupHarness(false, null);
  const { readers, select } = controlledPopupImports(h, true);
  select();
  h.tick(1000);
  assert.match(h.document.getElementById('status').textContent, /Unable to read imported file/);
  readers[0].load('Obsolete import');
  assert.equal(h.writes.length, 0);
  h.dom.window.close();
});

test('popup import in single mode saves only the preset list and preserves single text', () => {
  const h = popupHarness(false, null, { values: { mode: 'single', singleMessage: 'Single saved' } });
  const { readers, select } = controlledPopupImports(h);
  select();
  readers[0].load('Imported list');
  assert.equal(h.document.getElementById('message-list').value, 'Single saved');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].presetMessages, 'Imported list');
  assert.deepEqual(Object.keys(h.writes[0]), ['presetMessages']);
  h.document.querySelector('[data-mode="preset"]').click();
  assert.equal(h.document.getElementById('message-list').value, 'Imported list');
  h.dom.window.close();
});

test('popup emoji aria-pressed reflects hydrated selection and changes old and new buttons', () => {
  const h = popupHarness(false, null, { delay: { get: true }, values: { selectedEmoji: 'emojiSecond' } });
  const [first, second] = h.document.querySelectorAll('.emoji-btn');
  assert.equal(first.getAttribute('aria-pressed'), 'true');
  assert.equal(second.getAttribute('aria-pressed'), 'false');
  h.flush('get');
  assert.equal(first.getAttribute('aria-pressed'), 'false');
  assert.equal(second.getAttribute('aria-pressed'), 'true');
  first.click();
  assert.equal(first.getAttribute('aria-pressed'), 'true');
  assert.equal(second.getAttribute('aria-pressed'), 'false');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].selectedEmoji, 'emojiAngel');
  assert.deepEqual(Object.keys(h.writes[0]), ['selectedEmoji']);
  h.dom.window.close();
});

test('popup import validation and read errors survive change events and status polling', () => {
  const h = popupHarness(false, null);
  const input = h.document.getElementById('file-upload');
  const status = h.document.getElementById('status');
  let reader;
  h.dom.window.FileReader = class {
    constructor() { reader = { readAsText() {} }; return reader; }
  };
  const select = file => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new h.dom.window.Event('change', { bubbles: true }));
  };
  for (const file of [{ name: 'messages.csv', size: 10 }, { name: 'messages.txt', size: 1048577 }]) {
    select(file);
    assert.match(status.textContent, /Import a \.txt file no larger than 1 MiB/);
    h.tick(1000);
    assert.match(status.textContent, /Import a \.txt file no larger than 1 MiB/);
    assert.equal(input.value, '');
  }
  select({ name: 'messages.txt', size: 10 });
  reader.onerror();
  h.tick(1000);
  assert.match(status.textContent, /Unable to read imported file/);
  select({ name: 'messages.txt', size: 10 });
  reader.result = 'Imported message';
  reader.onload();
  assert.equal(h.document.getElementById('message-list').value, 'Imported message');
  assert.doesNotMatch(status.textContent, /Unable to read|Import a/);
  h.dom.window.close();
});

test('popup retries failed status reads and clears only recovered connection errors', () => {
  const h = popupHarness(false, null, { statusFailures: 1, running: true });
  assert.equal(h.document.getElementById('error-overlay').style.display, 'block');
  h.tick(1000);
  assert.equal(h.requests.filter(request => request.action === 'GET_STATUS').length, 2);
  assert.equal(h.document.getElementById('error-overlay').style.display, 'none');
  assert.equal(h.document.getElementById('btn-stop').style.display, 'block');
  assert.match(h.document.getElementById('status').textContent, /^Running/);
  h.dom.window.close();
});

test('popup recovers missing active tab without retrying actions', () => {
  const h = popupHarness(false, null, { queryFailures: 1 });
  assert.match(h.document.getElementById('status').textContent, /No accessible active tab/);
  h.tick(1000);
  assert.equal(h.requests.filter(request => request.action === 'GET_STATUS').length, 1);
  assert.equal(h.document.getElementById('error-overlay').style.display, 'none');
  h.dom.window.close();
});

test('popup status recovery retains storage read errors', () => {
  const h = popupHarness(false, null, { readError: true, statusFailures: 1 });
  h.tick(2000);
  assert.match(h.document.getElementById('status').textContent, /Settings storage read failed/);
  assert.equal(h.document.getElementById('error-overlay').style.display, 'none');
  h.dom.window.close();
});

test('popup status recovery never clears a local validation error', () => {
  const options = {};
  const h = popupHarness(false, null, options);
  options.statusFailures = 1;
  h.document.getElementById('min-time').value = '0';
  h.document.getElementById('btn-start').click();
  h.tick(2000);
  assert.match(h.document.getElementById('status').textContent, /Intervals must/);
  assert.equal(h.document.getElementById('error-overlay').style.display, 'none');
  h.dom.window.close();
});

test('popup never retries a failed START while status polling continues', () => {
  const h = popupHarness(false, null, { failActions: ['START'] });
  h.document.getElementById('btn-start').click();
  h.tick(3000);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 1);
  assert.match(h.document.getElementById('status').textContent, /Connection failed/);
  assert.ok(h.requests.filter(request => request.action === 'GET_STATUS').length >= 3);
  h.dom.window.close();
});

test('popup storage read failure preserves error but still exposes running engine STOP', () => {
  const h = popupHarness(false, null, { readError: true, running: true });
  assert.equal(h.requests.filter(request => request.action === 'GET_STATUS').length, 1);
  assert.equal(h.document.getElementById('btn-stop').style.display, 'block');
  assert.match(h.document.getElementById('status').textContent, /Settings storage read failed/);
  h.tick(2000);
  assert.match(h.document.getElementById('status').textContent, /Settings storage read failed/);
  h.document.getElementById('btn-stop').click();
  assert.equal(h.requests.filter(request => request.action === 'STOP').length, 1);
  h.dom.window.close();
});

test('popup exposes lastError and rejects invalid intervals before START', () => {
  const h = popupHarness();
  assert.equal(h.document.getElementById('status').textContent, 'Chat send button remained disabled.');
  for (const value of ['0', '-1', '1.5', '86401', '']) {
    h.document.getElementById('min-time').value = value;
    h.document.getElementById('btn-start').click();
  }
  assert.equal(h.requests.filter(request => request.action === 'START').length, 0);
  h.document.getElementById('min-time').value = '1';
  h.document.getElementById('max-time').value = '86400';
  h.document.getElementById('btn-start').click();
  assert.equal(h.requests.filter(request => request.action === 'START').length, 1);
  h.dom.window.close();
});

test('popup sends the selected catalog emote name and asset together', () => {
  const h = popupHarness();
  h.document.querySelector('[data-mode="emoji"]').click();
  h.document.getElementById('btn-start').click();
  const request = h.requests.find(value => value.action === 'START');
  assert.equal(request.settings.mode, 'emoji');
  assert.equal(request.settings.emoji, 'emojiAngel');
  assert.equal(request.settings.emojiUrl, emoteSettings.emojiUrl);
  h.dom.window.close();
});

test('popup surfaces storage failure and does not start with unsaved settings', () => {
  const h = popupHarness(true);
  h.document.getElementById('btn-start').click();
  assert.match(h.document.getElementById('status').textContent, /Settings storage failed/);
  assert.equal(h.requests.filter(request => request.action === 'START').length, 0);
  h.dom.window.close();
});

for (const phase of ['before START', 'before write', 'before click']) {
  test('SPA pathname drift fails closed ' + phase, () => {
    const h = harness();
    h.select();
    if (phase !== 'before START') assert.equal(h.request('START', settings).status, 'STARTED');
    if (phase === 'before click') h.tick(500);
    h.window.history.pushState({}, '', '/another-channel');
    if (phase === 'before START') assert.equal(h.request('START', settings).status, 'NO_TARGET');
    h.tick(2000);
    stopped(h);
    assert.equal(h.request('GET_STATUS').hasTarget, false);
    assert.equal(h.inputs(), phase === 'before click' ? 1 : 0);
    h.dom.window.close();
  });
}

test('selection never sends a receiverless notification or records its rejection', async () => {
  const h = harness();
  let calls = 0;
  h.window.chrome.runtime.sendMessage = () => {
    calls++;
    return Promise.reject(new Error('Receiving end does not exist.'));
  };
  h.select();
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(h.request('GET_STATUS').hasTarget, true);
  assert.equal(h.request('GET_STATUS').lastError, null);
  h.dom.window.close();
});

for (const failure of ['validation', 'storage']) {
  test('popup polling preserves local ' + failure + ' error beyond one second', () => {
    const h = popupHarness(failure === 'storage');
    if (failure === 'validation') h.document.getElementById('min-time').value = '0';
    h.document.getElementById('btn-start').click();
    const status = h.document.getElementById('status');
    assert.match(status.textContent, failure === 'validation' ? /Intervals must/ : /Settings storage failed/);
    const original = status.textContent;
    h.tick(2500);
    assert.equal(status.textContent, original);
    assert.equal(status.style.color, 'rgb(255, 68, 68)');
    assert.ok(h.requests.filter(request => request.action === 'GET_STATUS').length >= 3);
    h.dom.window.close();
  });
}

test('popup clears local error only on new input and restores remote error precedence', () => {
  const h = popupHarness();
  const input = h.document.getElementById('min-time');
  input.value = '0';
  h.document.getElementById('btn-start').click();
  h.tick(2000);
  assert.match(h.document.getElementById('status').textContent, /Intervals must/);
  input.value = '1';
  input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
  assert.equal(h.document.getElementById('status').textContent, 'Chat send button remained disabled.');
  h.tick(2000);
  assert.equal(h.document.getElementById('status').textContent, 'Chat send button remained disabled.');
  h.dom.window.close();
});

test('popup successful polling without remote errors still preserves local validation error', () => {
  const h = popupHarness(false, null);
  h.document.getElementById('min-time').value = '0';
  h.document.getElementById('btn-start').click();
  h.tick(2500);
  assert.match(h.document.getElementById('status').textContent, /Intervals must/);
  h.document.querySelector('[data-mode="single"]').click();
  assert.equal(h.document.getElementById('status').textContent, 'Ready to start');
  h.dom.window.close();
});

test('export manifest and substituted popup have valid syntax and minimal permissions', () => {
  const exportSource = readFileSync(new URL('../data/extensionFiles.ts', import.meta.url), 'utf8');
  const manifest = JSON.parse(exportSource.match(/content: `([\s\S]*?)`/)[1]);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(manifest.host_permissions.every(value => value.startsWith('https://')));
  const popup = readFileSync(new URL('../extension/popup.js', import.meta.url), 'utf8');
  assert.equal(popup.split('__KICK_EMOJIS__').length, 2);
  new vm.Script(popup.replace('__KICK_EMOJIS__', '[]'));
  new vm.Script(content);
  assert.equal(/antiDuplicate|KeyboardEvent|button\[type="submit"\]/.test(content + popup), false);
});
