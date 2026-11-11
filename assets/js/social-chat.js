(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cleanText = (value, max = 240) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const cleanName = (value) => {
    const name = String(value ?? '').trim().replace(/^@+/, '');
    return /^[A-Za-z0-9_]{3,20}$/.test(name) ? name : '';
  };
  const cleanSlug = (value) => cleanName(value).toLowerCase();
  const initial = (name) => (cleanName(name) || '?').charAt(0).toUpperCase();
  const timeText = (at) => { try { return new Date(Number(at) || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
  const ageText = (at) => {
    const mins = Math.max(0, Math.floor((Date.now() - (Number(at) || 0)) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const CHANNELS = Object.freeze([
    { id: 'general', name: 'general', topic: 'The front room. Say hello, share what you are up to, or just hang out.' },
    { id: 'gaming', name: 'gaming', topic: 'Talk games, trade tips, and find someone to play with.' },
    { id: 'creative', name: 'creative', topic: 'Screenshots, projects, and works in progress are welcome here.' },
    { id: 'help', name: 'help', topic: 'Stuck on something? Ask here and someone will lend a hand.' }
  ]);
  const CHANNEL_PREFIX = 'flashgames-social-room-v3-';
  const USER_PREFIX = 'flashgames-social-user-v3-';
  const USERNAME_KEY = 'flashchat.username.v1';
  const LEGACY_NAME_KEY = 'flashchat.name.v1';
  const MEDIA_DB = 'flashgames-social-media-v1';
  const MAX_GUESTS = 11;
  const MAX_MESSAGES = 160;
  const MAX_REELS = 24;
  const MAX_REEL_BYTES = 15 * 1024 * 1024;
  const REEL_CHUNK = 48 * 1024;
  const MAX_STREAM_VIEWERS = 6;
  const TYPING_MS = 2200;

  const saved = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
  const savedUsername = cleanName(saved(USERNAME_KEY));
  const suggestedName = savedUsername || cleanName(saved(LEGACY_NAME_KEY));

  let shell = null;
  let peersPromise = null;
  let dbPromise = null;
  let channelSerial = 0;
  let identityAttempt = 0;
  let typingPaintTimer = 0;
  let typingStopTimer = 0;
  let lastTypingSent = 0;
  let reelBusy = false;

  function makeChannel(id) {
    const info = CHANNELS.find((entry) => entry.id === id) || CHANNELS[0];
    return { id: info.id, info, session: ++channelSerial, connecting: false, joined: false, hosting: false, hostPeer: null, hostConn: null, guests: new Map(), members: [], messages: [], reels: [], streams: [], unread: 0, error: '', typing: new Map() };
  }

  function makeVoice() {
    return { joined: false, context: null, stream: null, calls: new Map(), audios: new Map(), incoming: null, calling: null };
  }

  function makeLive() {
    return { startOpen: false, broadcasting: null, viewers: new Map(), watching: null, watchConn: null, watchCall: null, remoteStream: null, stageSig: '' };
  }

  const S = {
    mounted: false, signedIn: !!savedUsername, username: savedUsername, slug: savedUsername.toLowerCase(),
    setupValue: suggestedName, setupBusy: false, setupError: '', identity: null,
    identityStatus: savedUsername ? 'connecting' : 'idle', identityError: '',
    active: { kind: 'channel', id: 'general' }, section: 'chat', channel: makeChannel('general'),
    dms: new Map(), dmError: '', voice: makeVoice(), live: makeLive(),
    localReels: new Map(), objectUrls: new Map(), reelView: null, reelSheetOpen: false, mobilePane: 'chat'
  };

  function toast(title, message, type = 'info') {
    if (window.FlashUI?.toast) return window.FlashUI.toast(title, message, type);
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const node = document.createElement('article');
    node.className = 'toast show';
    node.innerHTML = `<div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function copyText(value, message) {
    if (!value) return;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(() => toast('Copied', message, 'success')).catch(() => toast('Copy it yourself', value, 'info'));
    else toast('Copy it yourself', value, 'info');
  }

  function refreshIcons(root = shell) {
    if (!root) return;
    requestAnimationFrame(() => { try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5, width: 17, height: 17 } }); } catch {} });
  }

  function peerError(error) {
    const type = String(error?.type || '');
    const copy = {
      'unavailable-id': 'That username is already taken. Try another one.',
      'peer-unavailable': 'We could not find anyone online with that username.',
      network: 'Chat could not connect. Check your internet and try again.',
      'server-error': 'Chat is having trouble connecting. Try again in a moment.',
      'socket-error': 'Chat is having trouble connecting. Try again in a moment.',
      'socket-closed': 'The chat connection closed. Try again.',
      'browser-incompatible': 'This browser cannot open a chat connection.',
      timeout: 'Connecting is taking too long. Try again.'
    };
    const next = new Error(copy[type] || 'We could not connect. Check your internet and try again.');
    next.type = type;
    return next;
  }

  function loadPeers() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peersPromise) return peersPromise;
    peersPromise = (async () => {
      for (const src of ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js']) {
        try {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('load'));
            document.head.appendChild(s);
          });
          if (window.Peer) return window.Peer;
        } catch {}
      }
      throw new Error('Chat could not load. Check your internet and try again.');
    })().catch((error) => { peersPromise = null; throw error; });
    return peersPromise;
  }

  function openPeer(id, timeout = 15000) {
    return new Promise((resolve, reject) => {
      let peer = null, done = false;
      const finish = (error) => { if (done) return; done = true; clearTimeout(timer); try { peer?.destroy(); } catch {} reject(error); };
      const timer = setTimeout(() => finish(peerError({ type: 'timeout' })), timeout);
      try { peer = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 }); }
      catch (error) { clearTimeout(timer); reject(peerError(error)); return; }
      peer.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(peer); });
      peer.on('error', (error) => finish(peerError(error)));
    });
  }

  const userPeerId = (slug) => `${USER_PREFIX}${slug}`;
  const channelPeerId = (id) => `${CHANNEL_PREFIX}${id}`;
  const safeSend = (conn, data) => { try { if (!conn?.open) return false; conn.send(data); return true; } catch { return false; } };
  const members = () => Array.isArray(S.channel.members) ? S.channel.members : [];
  const thread = () => S.active.kind === 'dm' ? S.dms.get(S.active.slug) || null : null;
  const channelLabel = (id = S.channel.id) => `#${CHANNELS.find((c) => c.id === id)?.name || id}`;
  const isCurrentChannel = (channel, session) => !!channel && channel === S.channel && channel.session === session && S.signedIn;
  const visible = () => !!shell && document.visibilityState !== 'hidden' && shell.getClientRects().length > 0;
  const conversationVisible = (kind, key) => visible() && (kind === 'channel' ? S.active.kind === 'channel' && S.active.id === key : S.active.kind === 'dm' && S.active.slug === key);
  const setMobile = (pane) => { S.mobilePane = pane === 'rail' ? 'rail' : 'chat'; };
  const activeContext = () => S.active.kind === 'dm' ? { kind: 'dm', slug: S.active.slug } : { kind: 'channel', id: S.active.id };
  const sameContext = (a, b) => !!a && !!b && a.kind === b.kind && (a.kind === 'channel' ? a.id === b.id : a.slug === b.slug);

  function paint() {
    if (!shell) return;
    if (!S.signedIn) {
      if (!$('[data-sc-setup]', shell)) { shell.innerHTML = setupHTML(); requestAnimationFrame(() => $('[data-sc-setup-name]', shell)?.focus()); }
      paintSetup();
      refreshIcons(shell);
      return;
    }
    if (!$('[data-sc-app]', shell)) shell.innerHTML = appHTML();
    const app = $('[data-sc-app]', shell);
    app.classList.toggle('sc-mobile-rail', S.mobilePane === 'rail');
    app.classList.toggle('sc-mobile-chat', S.mobilePane !== 'rail');
    paintProfile(); paintSections(); paintChannels(); paintPeople(); paintDms();
    paintHeading(); paintBanner(); paintCall(); paintPanes();
    refreshIcons(shell);
  }

  function paintSetup() {
    const setup = $('[data-sc-setup]', shell);
    if (!setup) return;
    const button = $('[data-sc-setup-submit]', setup);
    const input = $('[data-sc-setup-name]', setup);
    const error = $('[data-sc-setup-error]', setup);
    const note = $('[data-sc-setup-note]', setup);
    if (button) { button.disabled = S.setupBusy; button.innerHTML = S.setupBusy ? 'Checking that name...' : `Enter chat ${icon('arrow-right')}`; }
    if (input) { input.disabled = S.setupBusy; input.setAttribute('aria-invalid', S.setupError ? 'true' : 'false'); }
    if (error) { error.textContent = S.setupError || ''; error.hidden = !S.setupError; }
    if (note) note.textContent = S.setupBusy ? 'Making sure the name is yours...' : 'No account, email, or password needed.';
    refreshIcons(setup);
  }

  function setupHTML() {
    return `<div class="sc-onboard"><div class="sc-onboard-inner">
      <section class="sc-onboard-story">
        <div class="sc-setup-brand"><span class="sc-brand-mark">${icon('messages-square')}</span><span>Flash Games Chat</span></div>
        <p class="sc-setup-kicker">Pull up a chair.</p>
        <h1>Pick the name people will know you by.</h1>
        <p class="sc-setup-lede">Channels are open to everyone. Private messages are just between you and one other person. Share a reel, start a stream, or hop into voice.</p>
        <div class="sc-setup-rule"></div><p class="sc-setup-fine">No account, no email, no password.</p>
      </section>
      <section class="sc-onboard-panel"><form class="sc-setup-form" data-sc-setup novalidate>
        <span class="sc-setup-label">Choose a username</span><h2>What should people call you?</h2>
        <p class="sc-setup-help">This is how people will find and message you.</p>
        <label class="sc-username-label" for="scSetupName">Username</label>
        <div class="sc-username-field"><span aria-hidden="true">@</span><input id="scSetupName" data-sc-setup-name maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="yourname" value="${esc(S.setupValue)}"></div>
        <p class="sc-setup-hint">3–20 characters. Letters, numbers, or underscores.</p>
        <p class="sc-setup-error" data-sc-setup-error role="alert" ${S.setupError ? '' : 'hidden'}>${esc(S.setupError)}</p>
        <button class="sc-setup-submit" type="submit" data-sc-setup-submit ${S.setupBusy ? 'disabled' : ''}>${S.setupBusy ? 'Checking that name...' : `Enter chat ${icon('arrow-right')}`}</button>
        <p class="sc-setup-note" data-sc-setup-note>${S.setupBusy ? 'Making sure the name is yours...' : 'No account, email, or password needed.'}</p>
      </form></section>
    </div></div>`;
  }

  function appHTML() {
    return `<div class="sc-shell sc-mobile-${esc(S.mobilePane)}" data-sc-app>
      <aside class="sc-rail">
        <header class="sc-rail-head"><span class="sc-brand-mark">${icon('messages-square')}</span><div><h1>Chat</h1><p>Flash Games</p></div></header>
        <nav class="sc-sections" data-sc-sections>
          <button type="button" data-sc-section="chat">${icon('message-circle')}<span>Chat</span></button>
          <button type="button" data-sc-section="reels">${icon('clapperboard')}<span>Reels</span></button>
          <button type="button" data-sc-section="live">${icon('radio')}<span>Live</span></button>
        </nav>
        <div class="sc-rail-scroll">
          <section class="sc-group"><div class="sc-group-head"><h2>Channels</h2><span>Public</span></div><nav class="sc-channel-list" data-sc-channels></nav></section>
          <section class="sc-group" data-sc-people-group><div class="sc-group-head"><h2 data-sc-people-title>Here now</h2><span data-sc-people-count></span></div><div class="sc-people" data-sc-people></div></section>
          <section class="sc-group"><div class="sc-group-head"><h2>Messages</h2></div><div class="sc-dm-list" data-sc-dms></div><div class="sc-new-dm-label">Start a private chat</div>
            <form class="sc-new-dm" data-sc-dm-form><span aria-hidden="true">@</span><input data-sc-dm-name maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="username" aria-label="Username to message"><button type="submit" aria-label="Start private chat">${icon('arrow-right')}</button></form>
            <p class="sc-rail-error" data-sc-dm-error ${S.dmError ? '' : 'hidden'}>${esc(S.dmError)}</p>
          </section>
        </div>
        <div class="sc-profile" data-sc-profile></div>
      </aside>
      <main class="sc-panel">
        <header class="sc-panel-head"><button class="sc-mobile-back" type="button" data-sc-mobile-back aria-label="Back to channels">${icon('arrow-left')}</button><div class="sc-heading" data-sc-heading></div><button class="sc-voice-btn" type="button" data-sc-voice disabled>${icon('mic')} Join voice</button></header>
        <div class="sc-banner" data-sc-banner hidden></div><div class="sc-call" data-sc-call hidden></div>
        <div class="sc-pane sc-chat-pane" data-sc-pane="chat">
          <div class="sc-messages" data-sc-messages aria-live="polite"></div>
          <div class="sc-compose-wrap"><p class="sc-typing-line" data-sc-typing aria-live="polite" hidden></p><form class="sc-composer" data-sc-composer><input data-sc-input maxlength="240" autocomplete="off" placeholder="Write a message..." aria-label="Message"><button class="sc-send" type="submit" aria-label="Send message">${icon('send')}</button></form><p class="sc-fineprint">Chats stay in this window. They are not saved to an account.</p></div>
        </div>
        <div class="sc-pane sc-reels-pane" data-sc-pane="reels" hidden></div>
        <div class="sc-pane sc-live-pane" data-sc-pane="live" hidden></div>
      </main>
    </div><div class="sc-reel-watch" data-sc-reel-watch hidden></div>`;
  }

  function paintProfile() {
    const node = $('[data-sc-profile]', shell);
    if (!node) return;
    const online = S.identityStatus === 'online' && !!S.identity?.open;
    const status = S.identityStatus === 'connecting' ? 'Connecting...' : S.identityStatus === 'reconnecting' ? 'Reconnecting...' : online ? 'Online' : 'Offline';
    node.innerHTML = `<span class="sc-avatar">${esc(initial(S.username))}</span><span class="sc-profile-copy"><strong>@${esc(S.username)}</strong><span class="sc-profile-status ${online ? 'is-online' : ''}"><i></i>${status}</span></span><button class="sc-icon-btn" type="button" data-sc-copy-username title="Copy your username">${icon('copy')}</button>${online ? '' : '<button class="sc-profile-retry" type="button" data-sc-retry-identity>Try again</button>'}`;
  }

  function paintSections() {
    const node = $('[data-sc-sections]', shell);
    if (!node) return;
    $$('[data-sc-section]', node).forEach((button) => {
      const active = button.dataset.scSection === S.section;
      button.classList.toggle('is-active', active);
      button.disabled = button.dataset.scSection !== 'chat' && S.active.kind !== 'channel';
    });
  }

  function paintChannels() {
    const node = $('[data-sc-channels]', shell);
    if (!node) return;
    node.innerHTML = CHANNELS.map((channel) => {
      const active = S.active.kind === 'channel' && S.active.id === channel.id;
      const connected = S.channel.id === channel.id && S.channel.joined;
      const unread = S.channel.id === channel.id && !active ? S.channel.unread : 0;
      return `<button class="sc-channel${active ? ' is-active' : ''}" type="button" data-sc-channel="${channel.id}"><span class="sc-channel-hash">#</span><span class="sc-channel-name">${channel.name}</span>${unread ? `<span class="sc-badge">${unread > 9 ? '9+' : unread}</span>` : connected ? '<span class="sc-here-dot" title="You are in this channel"></span>' : ''}</button>`;
    }).join('');
  }

  function paintPeople() {
    const group = $('[data-sc-people-group]', shell);
    if (!group) return;
    group.hidden = S.active.kind === 'dm';
    if (group.hidden) return;
    const title = $('[data-sc-people-title]', shell), count = $('[data-sc-people-count]', shell), node = $('[data-sc-people]', shell);
    if (title) title.textContent = channelLabel();
    if (count) count.textContent = members().length ? `${members().length} here` : '';
    if (!node) return;
    if (!members().length) { node.innerHTML = `<p class="sc-quiet">${S.channel.connecting ? 'Opening the channel...' : 'It is quiet in here.'}</p>`; return; }
    node.innerHTML = members().map((member) => {
      const self = member.slug === S.slug;
      const row = `<span class="sc-avatar">${esc(initial(member.username))}</span><span class="sc-person-copy"><strong>${esc(member.username)}${self ? ' <em>you</em>' : ''}</strong><small>${member.voice ? 'In voice' : 'Here now'}</small></span>${member.voice ? `<span class="sc-person-mic">${icon('volume-2')}</span>` : self ? '' : `<span class="sc-person-action">${icon('message-circle')}</span>`}`;
      return self ? `<div class="sc-person is-self">${row}</div>` : `<button class="sc-person" type="button" data-sc-person-dm="${member.slug}" title="Message @${esc(member.username)}">${row}</button>`;
    }).join('');
  }

  function paintDms() {
    const node = $('[data-sc-dms]', shell), error = $('[data-sc-dm-error]', shell);
    if (error) { error.textContent = S.dmError || ''; error.hidden = !S.dmError; }
    if (!node) return;
    const list = [...S.dms.values()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    node.innerHTML = list.length ? list.map((t) => {
      const active = S.active.kind === 'dm' && S.active.slug === t.slug;
      return `<button class="sc-dm${active ? ' is-active' : ''}" type="button" data-sc-dm-open="${t.slug}"><span class="sc-avatar">${esc(initial(t.username))}<i class="sc-presence ${t.conn?.open ? 'is-online' : ''}"></i></span><span class="sc-dm-copy"><strong>${esc(t.username)}</strong><small>${t.conn?.open ? 'Online' : t.connecting ? 'Connecting...' : 'Offline'}</small></span>${t.unread ? `<span class="sc-badge">${t.unread > 9 ? '9+' : t.unread}</span>` : ''}</button>`;
    }).join('') : '<p class="sc-quiet">No private chats yet.</p>';
  }

  function paintHeading() {
    const node = $('[data-sc-heading]', shell), voice = $('[data-sc-voice]', shell);
    if (!node) return;
    if (S.section === 'reels') { node.innerHTML = `<span class="sc-head-kicker">Reels</span><h2>${channelLabel()}</h2><p>Short videos shared with people in this channel.</p>`; if (voice) voice.hidden = true; return; }
    if (S.section === 'live') { node.innerHTML = `<span class="sc-head-kicker">Live</span><h2>${channelLabel()}</h2><p>Watch or share a screen, with the channel chat beside it.</p>`; if (voice) voice.hidden = true; return; }
    if (voice) voice.hidden = false;
    if (S.active.kind === 'dm') {
      const t = thread();
      node.innerHTML = `<span class="sc-head-kicker">Private chat</span><h2>@${esc(t?.username || S.active.slug)}</h2><p>${t?.conn?.open ? 'You are both here.' : t?.connecting ? 'Connecting...' : 'Offline right now.'}</p>`;
      if (voice) { const on = voiceIsCurrent(); voice.disabled = !S.identity?.open || !t?.conn?.open; voice.classList.toggle('is-on', on); voice.innerHTML = `${icon(on ? 'phone-off' : 'phone')} ${on ? 'End call' : 'Call'}`; }
      return;
    }
    const c = S.channel;
    node.innerHTML = `<span class="sc-head-kicker">Channel</span><h2>${channelLabel(c.id)}</h2><p>${esc(c.joined ? c.info.topic : c.connecting ? 'Opening the channel...' : c.error ? 'The channel is not open right now.' : c.info.topic)}</p>`;
    if (voice) { const on = voiceIsCurrent(); voice.disabled = !S.identity?.open || !c.joined; voice.classList.toggle('is-on', on); voice.innerHTML = `${icon(on ? 'mic-off' : 'mic')} ${on ? 'Leave voice' : 'Join voice'}`; }
  }

  function paintBanner() {
    const node = $('[data-sc-banner]', shell);
    if (!node) return;
    let msg = '', action = '';
    if (S.identityStatus === 'offline') { msg = S.identityError || 'You are offline right now.'; action = 'retry-identity'; }
    else if (S.active.kind === 'dm' && thread()?.error && !thread().connecting) { msg = thread().error; action = 'retry-dm'; }
    else if (S.channel.error && !S.channel.connecting) { msg = S.channel.error; action = 'retry-channel'; }
    node.hidden = !msg;
    node.innerHTML = msg ? `<span>${esc(msg)}</span><button type="button" data-sc-banner-action="${action}">Try again</button>` : '';
  }

  function paintPanes() {
    $$('[data-sc-pane]', shell).forEach((pane) => { pane.hidden = pane.dataset.scPane !== S.section; });
    if (S.section === 'chat') { paintMessages(); paintTyping(); paintComposer(); }
    else if (S.section === 'reels') paintReels();
    else paintLive();
  }

  function paintMessages() {
    const node = $('[data-sc-messages]', shell);
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 110;
    if (S.active.kind === 'dm') {
      const t = thread(), list = t?.messages || [];
      node.innerHTML = list.length ? messagesHTML(list) : t ? `<div class="sc-empty"><span class="sc-empty-icon">${icon('message-circle')}</span><strong>This is the start of your chat with @${esc(t.username)}.</strong><p>Say hello. Only the two of you can see it.</p></div>` : '';
    } else {
      const c = S.channel;
      node.innerHTML = c.messages.length ? messagesHTML(c.messages) : `<div class="sc-empty"><span class="sc-empty-icon">${icon('hash')}</span><strong>${esc(c.connecting ? `Opening #${c.info.name}...` : `#${c.info.name} is quiet.`)}</strong><p>${esc(c.info.topic)}</p>${!c.connecting && !c.joined ? '<button type="button" data-sc-retry-channel>Try opening again</button>' : ''}</div>`;
    }
    if (atBottom || !node.dataset.painted) requestAnimationFrame(() => { node.scrollTop = node.scrollHeight; });
    node.dataset.painted = '1';
  }

  function messagesHTML(list) {
    return list.map((m, i) => {
      if (m.system) return `<div class="sc-system">${esc(m.text)}</div>`;
      const mine = m.slug === S.slug;
      const prev = list[i - 1];
      const grouped = prev && !prev.system && prev.slug === m.slug && Number(m.at) - Number(prev.at) < 240000;
      return `<article class="sc-message${mine ? ' is-mine' : ''}${grouped ? ' is-grouped' : ''}">${grouped ? '<span class="sc-message-gap"></span>' : `<span class="sc-avatar">${esc(initial(m.username))}</span>`}<div class="sc-message-body">${grouped ? '' : `<div class="sc-message-meta"><strong>${esc(m.username)}${mine ? ' <em>you</em>' : ''}</strong><time>${timeText(m.at)}</time></div>`}<p>${esc(m.text)}</p></div></article>`;
    }).join('');
  }

  function canSend() {
    if (!S.signedIn || !S.identity?.open) return false;
    return S.active.kind === 'channel' ? !!S.channel.joined : !!thread()?.conn?.open;
  }

  function paintComposer() {
    const input = $('[data-sc-input]', shell);
    if (!input) return;
    input.disabled = !canSend();
    input.placeholder = S.active.kind === 'dm' ? (thread()?.conn?.open ? `Message @${thread().username}` : `@${thread()?.username || 'this person'} is offline.`) : S.channel.joined ? `Message #${S.channel.info.name}` : S.channel.connecting ? 'Opening the channel...' : `#${S.channel.info.name} is not available.`;
  }

  function paintTyping() {
    const node = $('[data-sc-typing]', shell);
    if (!node) return;
    const now = Date.now();
    let names = [];
    if (S.active.kind === 'dm') { const t = thread(); if (t?.typingUntil > now) names = [t.username]; }
    else names = [...S.channel.typing.entries()].filter(([slug, e]) => slug !== S.slug && e.until > now).map(([, e]) => e.username);
    const text = names.length === 1 ? `${names[0]} is typing...` : names.length === 2 ? `${names[0]} and ${names[1]} are typing...` : names.length ? `${names[0]} and ${names.length - 1} others are typing...` : '';
    node.textContent = text; node.hidden = !text;
  }

  function paintCall() {
    const node = $('[data-sc-call]', shell);
    if (!node) return;
    if (S.voice.incoming) {
      const from = S.voice.incoming.username ? `@${S.voice.incoming.username}` : 'Someone';
      node.hidden = false; node.className = 'sc-call is-incoming';
      node.innerHTML = `<span class="sc-call-icon">${icon('phone')}</span><div class="sc-call-copy"><strong>${esc(from)} is calling</strong><span>Answer to join the voice chat.</span></div><div class="sc-call-actions"><button class="sc-call-accept" type="button" data-sc-answer>Answer</button><button class="sc-call-decline" type="button" data-sc-decline>Not now</button></div>`;
      return;
    }
    if (voiceIsCurrent() && S.section === 'chat') {
      node.hidden = false; node.className = 'sc-call is-active';
      if (S.active.kind === 'channel') {
        const other = members().filter((m) => m.voice && m.slug !== S.slug).map((m) => `@${m.username}`);
        node.innerHTML = `<span class="sc-call-icon">${icon('volume-2')}</span><div class="sc-call-copy"><strong>Voice is on</strong><span>${other.length ? `In here with ${other.join(', ')}` : 'Waiting for someone to join.'}</span></div>`;
      } else {
        const t = thread();
        node.innerHTML = `<span class="sc-call-icon">${icon('phone')}</span><div class="sc-call-copy"><strong>${S.voice.calling ? `Calling @${esc(t?.username || '')}` : `On a call with @${esc(t?.username || '')}`}</strong><span>${S.voice.calling ? 'Ringing...' : 'Your microphone is on.'}</span></div>`;
      }
      return;
    }
    node.hidden = true; node.className = 'sc-call'; node.innerHTML = '';
  }

  async function claimUsername(raw) {
    if (S.setupBusy) return;
    const name = cleanName(raw);
    if (!name) { S.setupError = 'Use 3–20 letters, numbers, or underscores.'; paintSetup(); $('[data-sc-setup-name]', shell)?.focus(); return; }
    S.setupBusy = true; S.setupError = ''; paintSetup();
    try {
      await loadPeers();
      const peer = await openPeer(userPeerId(name.toLowerCase()), 16000);
      S.identity = peer; S.username = name; S.slug = name.toLowerCase(); S.signedIn = true;
      S.identityStatus = 'online'; S.identityError = ''; S.setupBusy = false;
      S.channel = makeChannel('general'); S.active = { kind: 'channel', id: 'general' }; S.section = 'chat'; setMobile('chat');
      try { localStorage.setItem(USERNAME_KEY, name); } catch {}
      bindIdentity(peer);
      await loadLocalReels();
      paint(); connectChannel(S.channel);
    } catch (error) {
      S.setupBusy = false;
      S.setupError = error?.type === 'unavailable-id' ? 'That username is already taken. Try another one.' : error?.message || 'We could not open chat. Check your connection and try again.';
      paintSetup(); $('[data-sc-setup-name]', shell)?.focus();
    }
  }

  async function resumeIdentity() {
    if (!S.signedIn || !S.username) return;
    const attempt = ++identityAttempt;
    S.identityStatus = 'connecting'; S.identityError = ''; paint();
    try {
      await loadPeers();
      const peer = await openPeer(userPeerId(S.slug), 16000);
      if (attempt !== identityAttempt || !S.signedIn) { try { peer.destroy(); } catch {} return; }
      S.identity = peer; S.identityStatus = 'online'; S.identityError = '';
      bindIdentity(peer); await loadLocalReels(); paint();
      if (!S.channel.joined && !S.channel.connecting) connectChannel(S.channel);
    } catch (error) {
      if (attempt !== identityAttempt) return;
      if (error?.type === 'unavailable-id') {
        const prev = S.username;
        try { localStorage.removeItem(USERNAME_KEY); } catch {}
        S.signedIn = false; S.username = ''; S.slug = ''; S.identityStatus = 'idle';
        S.setupValue = prev; S.setupError = 'That username is already in use. Choose another one.';
        paint(); return;
      }
      S.identityStatus = 'offline'; S.identityError = error?.message || 'We could not connect to chat. Check your connection and try again.';
      paint();
    }
  }

  async function retryIdentity() {
    if (S.identityStatus === 'connecting') return;
    identityAttempt++;
    if (S.identity) { try { S.identity.destroy(); } catch {} }
    S.identity = null; await resumeIdentity();
  }

  function bindIdentity(peer) {
    peer.on('connection', receiveIdentityConnection);
    peer.on('call', receiveMediaCall);
    peer.on('disconnected', () => {
      if (S.identity !== peer) return;
      S.identityStatus = 'reconnecting'; paint();
      setTimeout(() => { try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch {} }, 800);
    });
    peer.on('open', () => { if (S.identity !== peer) return; S.identityStatus = 'online'; S.identityError = ''; paint(); });
    peer.on('close', () => {
      if (S.identity !== peer) return;
      S.identityStatus = 'offline'; S.identityError = 'The chat connection was lost. Try again.';
      stopVoice(false); stopWatching(); paint();
    });
    peer.on('error', (error) => {
      if (S.identity !== peer) return;
      const type = String(error?.type || '');
      if (type === 'peer-unavailable') return;
      if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) {
        S.identityStatus = 'offline'; S.identityError = 'We lost the chat connection. Check your connection and try again.'; paint();
      }
    });
  }

  function receiveIdentityConnection(conn) {
    if (!conn) return;
    let mode = 'pending', dm = null;
    const timer = setTimeout(() => { if (mode === 'pending') { try { conn.close(); } catch {} } }, 12000);
    const closed = () => {
      clearTimeout(timer);
      if (mode === 'dm' && dm?.conn === conn) { dm.conn = null; dm.online = false; paintHeading(); paintDms(); }
      if (mode === 'stream') removeStreamViewer(conn);
    };
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;
      if (mode === 'pending') {
        if (data.t === 'dm-hello') {
          const name = cleanName(data.username), slug = cleanSlug(name);
          if (!name || data.slug !== slug || conn.peer !== userPeerId(slug) || slug === S.slug) { try { conn.close(); } catch {} return; }
          clearTimeout(timer); mode = 'dm'; dm = getThread(name);
          if (!dm) { try { conn.close(); } catch {} return; }
          if (dm.conn && dm.conn !== conn) { try { dm.conn.close(); } catch {} }
          dm.conn = conn; dm.username = name; dm.online = true; dm.connecting = false; dm.error = '';
          safeSend(conn, { t: 'dm-welcome', username: S.username, slug: S.slug }); paint(); return;
        }
        if (data.t === 'reel-get') { clearTimeout(timer); mode = 'reel'; serveReel(conn, data); return; }
        if (data.t === 'stream-join') { clearTimeout(timer); mode = 'stream'; serveStreamJoin(conn, data); return; }
        return;
      }
      if (mode === 'dm' && dm) handleDmData(dm, conn, data);
    });
    conn.on('close', closed); conn.on('error', closed);
  }

  window.FlashSocialChat = { mount: (root) => mount(root), state: () => S };
  /* ---------------- channels ---------------- */

  function closeChannelTransport(channel) {
    if (!channel) return;
    channel.session++;
    try { channel.hostConn?.close(); } catch {}
    channel.guests.forEach((g) => { try { g.conn.close(); } catch {} });
    channel.guests.clear();
    try { channel.hostPeer?.destroy(); } catch {}
    channel.hostPeer = null; channel.hostConn = null; channel.hosting = false;
    channel.joined = false; channel.connecting = false; channel.typing.clear();
  }

  function joinChannel(id) {
    if (!S.signedIn || !S.identity?.open) return;
    if (S.active.kind === 'channel' && S.channel.id === id) {
      S.section = 'chat'; S.mobilePane = 'chat'; S.channel.unread = 0;
      if (!S.channel.joined && !S.channel.connecting && !S.channel.error) connectChannel(S.channel);
      paint(); return;
    }
    if (S.live.broadcasting) stopBroadcast();
    stopWatching();
    stopVoice();
    closeChannelTransport(S.channel);
    S.channel = makeChannel(id);
    S.active = { kind: 'channel', id };
    S.section = 'chat'; S.mobilePane = 'chat'; resetTyping();
    paint();
    if (S.identity?.open) connectChannel(S.channel);
  }

  async function connectChannel(channel) {
    if (!isCurrentChannel(channel, channel.session)) return;
    if (!S.identity?.open || S.identityStatus !== 'online') {
      channel.connecting = false; channel.error = 'You are offline. Try connecting again.'; paint(); return;
    }
    if (channel.connecting) return;
    channel.connecting = true; channel.joined = false; channel.error = ''; paint();
    const session = channel.session;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isCurrentChannel(channel, session)) return;
      let hostPeer = null;
      try { hostPeer = await openPeer(channelPeerId(channel.id), 6000); }
      catch (error) {
        if (!isCurrentChannel(channel, session)) { try { hostPeer?.destroy(); } catch {} return; }
        if (error?.type !== 'unavailable-id') {
          channel.connecting = false; channel.error = `We could not reach #${channel.info.name}. Try again.`; paint(); return;
        }
      }
      if (!isCurrentChannel(channel, session)) { try { hostPeer?.destroy(); } catch {} return; }
      if (hostPeer) { becomeHost(channel, hostPeer, session); return; }
      try { await joinHostChannel(channel, session); if (isCurrentChannel(channel, session) && channel.joined) return; } catch {}
      await wait(350 + attempt * 250);
    }
    if (!isCurrentChannel(channel, session)) return;
    channel.connecting = false; channel.error = `We could not open #${channel.info.name} right now. Try again.`; paint();
  }

  function ownMember() {
    return { username: S.username, slug: S.slug, peerId: S.identity?.id || userPeerId(S.slug), voice: !!(S.voice.joined && S.voice.context?.kind === 'channel' && S.voice.context.id === S.channel.id) };
  }

  function publicMembers(list = members()) {
    return list.map((m) => ({ username: m.username, slug: m.slug, peerId: m.peerId, voice: !!m.voice }));
  }

  function syncHostMembers(channel) {
    if (!channel.hosting || !isCurrentChannel(channel, channel.session)) return;
    channel.members = [ownMember(), ...[...channel.guests.values()].map((g) => ({ username: g.username, slug: g.slug, peerId: g.peerId, voice: !!g.voice }))];
    broadcastChannel({ t: 'members', members: publicMembers(channel.members) });
    paint(); reconcileVoiceCalls();
  }

  function broadcastChannel(payload) {
    if (!S.channel.hosting) return;
    S.channel.guests.forEach((g) => safeSend(g.conn, payload));
  }

  function pushChannelMessage(channel, message, broadcast = true) {
    const msg = message.system
      ? { system: true, text: cleanText(message.text), at: Number(message.at) || Date.now() }
      : { username: cleanName(message.username), slug: cleanSlug(message.username), text: cleanText(message.text), at: Number(message.at) || Date.now() };
    if (!msg.system && (!msg.username || !msg.text)) return null;
    channel.messages.push(msg);
    if (channel.messages.length > MAX_MESSAGES) channel.messages.splice(0, channel.messages.length - MAX_MESSAGES);
    if (!msg.system && !conversationVisible('channel', channel.id)) channel.unread++;
    if (broadcast && channel.hosting) broadcastChannel({ t: 'message', message: msg });
    return msg;
  }

  function becomeHost(channel, peer, session) {
    if (!isCurrentChannel(channel, session)) { try { peer.destroy(); } catch {} return; }
    channel.hostPeer = peer; channel.hosting = true; channel.connecting = false; channel.joined = true;
    channel.error = ''; channel.hostConn = null; channel.guests.clear();
    channel.members = [ownMember()]; channel.typing.clear();
    if (!channel.reels.length) channel.reels = localReelsForChannel(channel.id);
    paint();
    peer.on('connection', (conn) => acceptGuest(conn, channel, session));
    peer.on('disconnected', () => { setTimeout(() => { try { if (!peer.destroyed && peer.disconnected) peer.reconnect(); } catch {} }, 800); });
    peer.on('close', () => {
      if (!isCurrentChannel(channel, session) || channel.hostPeer !== peer) return;
      channel.hostPeer = null; channel.hosting = false; channel.joined = false; channel.connecting = true; paint();
      setTimeout(() => { if (isCurrentChannel(channel, session) && !channel.joined) { channel.connecting = false; connectChannel(channel); } }, 800);
    });
    peer.on('error', () => { if (isCurrentChannel(channel, session) && channel.hostPeer === peer) { channel.error = 'We lost the channel connection. Try again.'; paint(); } });
    announceOwnStream();
  }

  function acceptGuest(conn, channel, session) {
    if (!isCurrentChannel(channel, session)) { try { conn.close(); } catch {} return; }
    let guest = null, joined = false;
    const timer = setTimeout(() => { if (!joined) { try { conn.close(); } catch {} } }, 10000);
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;
      if (!joined) {
        if (data.t !== 'join') return;
        const name = cleanName(data.username), slug = cleanSlug(name);
        if (!name || data.slug !== slug || conn.peer !== userPeerId(slug) || slug === S.slug || channel.guests.has(slug)) { try { conn.close(); } catch {} return; }
        if (channel.guests.size >= MAX_GUESTS) { safeSend(conn, { t: 'full', message: 'This channel is full right now.' }); try { conn.close(); } catch {} return; }
        joined = true; clearTimeout(timer);
        guest = { conn, username: name, slug, peerId: conn.peer, voice: !!data.voice };
        channel.guests.set(slug, guest);
        channel.members = [ownMember(), ...[...channel.guests.values()].map((g) => ({ username: g.username, slug: g.slug, peerId: g.peerId, voice: !!g.voice }))];
        safeSend(conn, { t: 'welcome', members: publicMembers(channel.members), messages: channel.messages.slice(-MAX_MESSAGES), reels: channel.reels, streams: channel.streams });
        const join = pushChannelMessage(channel, { system: true, text: `${name} joined the channel.` }, false);
        if (join) broadcastChannel({ t: 'message', message: join });
        broadcastChannel({ t: 'members', members: publicMembers(channel.members) });
        broadcastChannel({ t: 'reels', reels: channel.reels });
        broadcastChannel({ t: 'streams', streams: channel.streams });
        paint(); return;
      }
      if (data.t === 'message') {
        const text = cleanText(data.text); if (!text) return;
        clearTyping(guest.slug);
        pushChannelMessage(channel, { username: guest.username, text, at: Date.now() });
        broadcastChannel({ t: 'typing', username: guest.username, slug: guest.slug, active: false });
        paint(); return;
      }
      if (data.t === 'typing') {
        if (data.active) channel.typing.set(guest.slug, { username: guest.username, until: Date.now() + TYPING_MS });
        else channel.typing.delete(guest.slug);
        broadcastChannel({ t: 'typing', username: guest.username, slug: guest.slug, active: !!data.active });
        clearTimeout(typingPaintTimer); if (data.active) typingPaintTimer = setTimeout(paintTyping, TYPING_MS + 80);
        paintTyping(); return;
      }
      if (data.t === 'voice') { guest.voice = !!data.on; syncHostMembers(channel); return; }
      if (data.t === 'reel-add') { hostAddReel(channel, data.reel, guest); return; }
      if (data.t === 'reel-like') { hostToggleReelLike(channel, String(data.id || ''), guest.slug); return; }
      if (data.t === 'reel-view') { hostViewReel(channel, String(data.id || '')); return; }
      if (data.t === 'stream-add') { hostAddStream(channel, data.stream, guest); return; }
      if (data.t === 'stream-remove') { hostRemoveStream(channel, String(data.id || ''), guest.slug); return; }
      if (data.t === 'stream-stats') { hostStreamStats(channel, String(data.id || ''), guest.slug, data.viewers); return; }
    });
    const gone = () => {
      clearTimeout(timer);
      if (!guest || !isCurrentChannel(channel, session) || channel.guests.get(guest.slug) !== guest) return;
      channel.guests.delete(guest.slug); channel.typing.delete(guest.slug);
      channel.streams = channel.streams.filter((s) => s.slug !== guest.slug);
      channel.members = [ownMember(), ...[...channel.guests.values()].map((g) => ({ username: g.username, slug: g.slug, peerId: g.peerId, voice: !!g.voice }))];
      const note = pushChannelMessage(channel, { system: true, text: `${guest.username} left the channel.` }, false);
      if (note) broadcastChannel({ t: 'message', message: note });
      broadcastChannel({ t: 'members', members: publicMembers(channel.members) });
      broadcastChannel({ t: 'streams', streams: channel.streams });
      stopPeerAudio(guest.peerId); paint(); reconcileVoiceCalls();
    };
    conn.on('close', gone); conn.on('error', gone);
  }

  async function joinHostChannel(channel, session) {
    return new Promise((resolve, reject) => {
      if (!isCurrentChannel(channel, session) || !S.identity?.open) { reject(new Error('offline')); return; }
      const target = channelPeerId(channel.id);
      let conn = null, done = false, timer = 0;
      const removeListener = () => { try { S.identity.off?.('error', onPeerError); } catch {} };
      const fail = (error) => {
        if (done) return; done = true; clearTimeout(timer); removeListener();
        try { conn?.close(); } catch {}
        if (channel.hostConn === conn) channel.hostConn = null;
        reject(error || new Error('unavailable'));
      };
      const onPeerError = (error) => { if (error?.type === 'peer-unavailable' && String(error.message || '').includes(target)) fail(error); };
      try { conn = S.identity.connect(target, { reliable: true, serialization: 'json' }); } catch (error) { fail(error); return; }
      if (!conn) { fail(new Error('offline')); return; }
      channel.hostConn = conn;
      try { S.identity.on('error', onPeerError); } catch {}
      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (!done) {
          if (data.t !== 'welcome') return;
          if (!isCurrentChannel(channel, session)) { fail(new Error('stale')); return; }
          done = true; clearTimeout(timer); removeListener();
          channel.joined = true; channel.connecting = false; channel.hosting = false; channel.error = '';
          channel.members = normalizeMembers(data.members);
          channel.messages = normalizeMessages(data.messages);
          channel.reels = normalizeReels(data.reels);
          channel.streams = normalizeStreams(data.streams);
          channel.typing.clear(); channel.unread = 0; paint();
          syncOwnReels(); announceOwnStream(); reconcileVoiceCalls(); resolve(); return;
        }
        if (data.t === 'message' && data.message) { if (pushChannelMessage(channel, data.message, false)) { clearTyping(data.message.slug); paint(); } return; }
        if (data.t === 'members') { channel.members = normalizeMembers(data.members); paint(); reconcileVoiceCalls(); return; }
        if (data.t === 'typing') { rememberTyping(data.username, data.slug, !!data.active); return; }
        if (data.t === 'reels') { channel.reels = normalizeReels(data.reels); paintReels(); return; }
        if (data.t === 'streams') {
          channel.streams = normalizeStreams(data.streams);
          const watching = S.live.watching;
          if (watching) {
            const fresh = channel.streams.find((s) => s.id === watching.stream.id);
            if (fresh) watching.stream = fresh;
            else if (watching.state !== 'ended') { endWatch('That stream ended.'); return; }
          }
          paintLiveStage(); paintLiveChat(); return;
        }
        if (data.t === 'full') { channel.error = cleanText(data.message) || 'This channel is full right now.'; channel.joined = false; channel.connecting = false; paint(); }
      });
      conn.on('open', () => safeSend(conn, { t: 'join', username: S.username, slug: S.slug, voice: !!(S.voice.joined && S.voice.context?.kind === 'channel' && S.voice.context.id === channel.id) }));
      conn.on('error', (error) => { if (!done) fail(error); });
      conn.on('close', () => {
        if (!done) { fail(new Error('closed')); return; }
        if (!isCurrentChannel(channel, session)) return;
        channel.joined = false; channel.hostConn = null; channel.members = []; channel.connecting = true; channel.error = '';
        if (S.voice.joined && S.voice.context?.kind === 'channel') stopVoice(false);
        if (S.live.broadcasting?.channelId === channel.id) stopBroadcast(false);
        stopWatching(); paint();
        setTimeout(() => { if (isCurrentChannel(channel, session) && !channel.joined) { channel.connecting = false; connectChannel(channel); } }, 800);
      });
      timer = setTimeout(() => fail(new Error('timeout')), 7500);
    });
  }

  function normalizeMembers(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map((m) => {
      const username = cleanName(m?.username), slug = cleanSlug(username);
      if (!username || !slug || seen.has(slug)) return null;
      seen.add(slug);
      return { username, slug, peerId: String(m?.peerId || userPeerId(slug)), voice: !!m?.voice };
    }).filter(Boolean);
  }

  function normalizeMessages(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(-MAX_MESSAGES).map((m) => m?.system
      ? { system: true, text: cleanText(m.text), at: Number(m.at) || Date.now() }
      : { username: cleanName(m?.username), slug: cleanSlug(m?.username), text: cleanText(m?.text), at: Number(m?.at) || Date.now() })
      .filter((m) => m.system ? !!m.text : !!(m.username && m.text));
  }

  function sendChannel(text) {
    const msg = cleanText(text); if (!msg || !S.channel.joined) return false;
    const c = S.channel;
    if (c.hosting) { pushChannelMessage(c, { username: S.username, text: msg, at: Date.now() }); paintMessages(); paintLiveChat(); }
    else if (!safeSend(c.hostConn, { t: 'message', text: msg })) { c.error = 'The channel connection is not open.'; paint(); return false; }
    stopTypingSignal(); return true;
  }

  function resetTyping() {
    clearTimeout(typingStopTimer); typingStopTimer = 0; lastTypingSent = 0;
  }

  function stopTypingSignal() {
    clearTimeout(typingStopTimer); typingStopTimer = 0; lastTypingSent = 0;
    typingSignal(false);
  }

  function typingSignal(active) {
    if (S.active.kind === 'dm') { const t = thread(); if (t?.conn?.open) safeSend(t.conn, { t: 'typing', active: !!active }); return; }
    if (!S.channel.joined) return;
    if (S.channel.hosting) { if (active) broadcastChannel({ t: 'typing', username: S.username, slug: S.slug, active: true }); }
    else safeSend(S.channel.hostConn, { t: 'typing', active: !!active });
  }

  function noteTyping() {
    if (!canSend()) return;
    const now = Date.now();
    if (now - lastTypingSent > 1100) { lastTypingSent = now; typingSignal(true); }
    clearTimeout(typingStopTimer);
    typingStopTimer = setTimeout(() => { typingStopTimer = 0; lastTypingSent = 0; typingSignal(false); }, 1900);
  }

  function rememberTyping(username, slug, active) {
    const name = cleanName(username);
    if (!name || !slug || slug === S.slug) return;
    if (active) S.channel.typing.set(slug, { username: name, until: Date.now() + TYPING_MS });
    else S.channel.typing.delete(slug);
    clearTimeout(typingPaintTimer); if (active) typingPaintTimer = setTimeout(paintTyping, TYPING_MS + 80);
    paintTyping();
  }

  function clearTyping(slug) { if (S.channel.typing.delete(slug)) paintTyping(); }
  function sendTyping() { if (S.active.kind === 'dm') safeSend(thread()?.conn, { t: 'typing', active: true }); else typingSignal(true); }

  function setSection(section) {
    if (!['chat', 'reels', 'live'].includes(section)) return;
    if (section !== 'chat' && S.active.kind !== 'channel') {
      if (S.channel.joined) { S.active = { kind: 'channel', id: S.channel.id }; paintHeading(); }
      else { toast('Open a channel first', 'Reels and Live are shared inside public channels.'); return; }
    }
    if (S.voice.joined && section !== 'chat') stopVoice();
    if (section !== 'live') stopWatching();
    S.section = section; setMobile('chat');
    paint();
  }

  function selectDm(slug) {
    const t = S.dms.get(slug); if (!t) return;
    if (S.voice.joined && S.voice.context?.kind === 'channel') stopVoice();
    if (S.live.broadcasting) stopBroadcast();
    stopWatching();
    S.active = { kind: 'dm', slug }; S.section = 'chat'; S.mobilePane = 'chat';
    t.unread = 0; S.dmError = ''; resetTyping();
    if (S.voice.joined && !voiceIsCurrent()) stopVoice(false);
    paint();
    if (!t.conn?.open && !t.connecting) connectDm(t);
    else $('[data-sc-input]', shell)?.focus();
  }

  function startDm(raw) {
    const name = cleanName(raw);
    if (!name) { S.dmError = 'Use 3–20 letters, numbers, or underscores.'; paintDms(); return; }
    if (name.toLowerCase() === S.slug) { S.dmError = 'That is your own username.'; paintDms(); return; }
    if (!S.identity?.open) { S.dmError = 'You are not connected yet.'; paintDms(); return; }
    const t = getThread(name);
    if (!t) return;
    S.dmError = ''; selectDm(t.slug);
  }
  /* ---------------- direct messages ---------------- */

  function getThread(name) {
    const username = cleanName(name); if (!username) return null;
    const slug = username.toLowerCase();
    if (slug === S.slug) return null;
    let t = S.dms.get(slug);
    if (!t) {
      t = { slug, username, conn: null, messages: [], unread: 0, online: false, connecting: false, typingUntil: 0, lastAt: 0, error: '' };
      S.dms.set(slug, t);
    } else t.username = username;
    return t;
  }

  function connectDm(t) {
    if (!t || t.connecting || t.conn?.open || !S.identity?.open) return;
    t.connecting = true; t.error = ''; paintDms(); paintHeading();
    const target = userPeerId(t.slug);
    let conn = null, done = false, timer = 0;
    const removeListener = () => { try { S.identity.off?.('error', onPeerError); } catch {} };
    const fail = (message) => {
      if (done) return; done = true; clearTimeout(timer); removeListener();
      try { conn?.close(); } catch {}
      if (t.conn === conn) t.conn = null;
      t.connecting = false; t.online = false; t.error = message; S.dmError = message;
      paint(); paintHeading();
    };
    const onPeerError = (error) => {
      if (error?.type !== 'peer-unavailable') return;
      if (String(error.message || '').includes(target)) fail(`We could not reach @${t.username}. They may be offline.`);
    };
    try { conn = S.identity.connect(target, { reliable: true, serialization: 'json' }); }
    catch { fail(`We could not reach @${t.username}.`); return; }
    if (!conn) { fail(`We could not reach @${t.username}.`); return; }
    t.conn = conn;
    try { S.identity.on('error', onPeerError); } catch {}
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;
      if (data.t === 'dm-welcome') { const name = cleanName(data.username); if (name) t.username = name; paintHeading(); return; }
      handleDmData(t, conn, data);
    });
    conn.on('open', () => {
      if (done) return; done = true; clearTimeout(timer); removeListener();
      t.connecting = false; t.online = true; t.error = ''; S.dmError = '';
      safeSend(conn, { t: 'dm-hello', username: S.username, slug: S.slug });
      paint(); paintHeading();
    });
    conn.on('error', () => { if (!done) fail(`We could not reach @${t.username}.`); else if (t.conn === conn) { t.conn = null; t.online = false; paintHeading(); paintDms(); } });
    conn.on('close', () => {
      if (!done) { fail(`We could not reach @${t.username}. They may be offline.`); return; }
      if (t.conn !== conn) return;
      t.conn = null; t.online = false; t.connecting = false; paintHeading(); paintDms();
    });
    timer = setTimeout(() => { if (!done) fail(`We could not reach @${t.username}. They may be offline.`); }, 9000);
  }

  function handleDmData(t, conn, data) {
    if (!t || !data) return;
    if (data.t === 'typing') {
      t.typingUntil = data.active ? Date.now() + TYPING_MS : 0;
      clearTimeout(typingPaintTimer); if (data.active) typingPaintTimer = setTimeout(paintTyping, TYPING_MS + 80);
      paintTyping(); return;
    }
    if (data.t !== 'dm') return;
    const text = cleanText(data.text); if (!text) return;
    const msg = { username: t.username, slug: t.slug, text, at: Number(data.at) || Date.now() };
    t.messages.push(msg); if (t.messages.length > MAX_MESSAGES) t.messages.shift();
    t.lastAt = Date.now(); t.typingUntil = 0;
    if (!conversationVisible('dm', t.slug)) t.unread++;
    paintDms(); paintMessages(); paintTyping();
  }

  function sendDm(text) {
    const t = thread(), msg = cleanText(text);
    if (!t || !msg) return false;
    if (!t.conn?.open) { t.error = `@${t.username} is offline right now.`; paint(); return false; }
    const message = { username: S.username, slug: S.slug, text: msg, at: Date.now() };
    t.messages.push(message); t.lastAt = Date.now();
    if (t.messages.length > MAX_MESSAGES) t.messages.shift();
    const ok = safeSend(t.conn, { t: 'dm', text: msg, at: message.at });
    if (!ok) t.error = 'That message could not be sent.';
    stopTypingSignal(); paintMessages(); paint(); return ok;
  }

  function sendChat(text) {
    const clean = cleanText(text); if (!clean) return false;
    return S.active.kind === 'dm' ? sendDm(clean) : sendChannel(clean);
  }

  /* ---------------- voice ---------------- */

  function voiceIsCurrent() {
    if (!S.voice.joined || !S.voice.context) return false;
    return sameContext(S.voice.context, activeContext());
  }

  async function requestMic() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone.');
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  }

  function attachPeerAudio(peerId, stream) {
    if (!stream) return;
    const audio = document.createElement('audio');
    audio.autoplay = true; audio.playsInline = true; audio.hidden = true; audio.srcObject = stream;
    document.body.appendChild(audio); S.voice.audios.set(peerId, audio);
    audio.play?.().catch(() => {});
  }

  function stopPeerAudio(peerId) {
    const audio = S.voice.audios.get(peerId);
    if (audio) { try { audio.pause(); audio.srcObject = null; audio.remove(); } catch {} S.voice.audios.delete(peerId); }
  }

  function setSelfMemberVoice(on) {
    const self = S.channel.members.find((m) => m.slug === S.slug);
    if (self) self.voice = !!on;
  }

  function closeVoiceCall(peerId, call) {
    const existing = S.voice.calls.get(peerId);
    if (call && existing !== call) return;
    try { call?.close(); } catch {}
    S.voice.calls.delete(peerId); stopPeerAudio(peerId);
    if (S.voice.context?.kind === 'dm' && S.voice.joined && !S.voice.calls.size) endDmVoice('The call ended.');
    paintCall();
  }

  function endDmVoice(note) {
    const t = thread();
    if (note) toast('Call ended', t ? `The call with @${t.username} ended.` : note, 'info');
    stopVoice(false);
  }

  function makeVoiceCall(peerId, username, kind) {
    if (!S.identity?.open || !S.voice.stream || S.voice.calls.has(peerId)) return null;
    let call = null;
    try { call = S.identity.call(peerId, S.voice.stream, { metadata: { kind: 'voice', username: S.username, context: kind } }); } catch {}
    if (!call) return null;
    S.voice.calls.set(peerId, call);
    call.on('stream', (stream) => { attachPeerAudio(peerId, stream); if (S.voice.context?.kind === 'dm') { S.voice.calling = null; paintCall(); } });
    call.on('close', () => closeVoiceCall(peerId, call));
    call.on('error', () => closeVoiceCall(peerId, call));
    return call;
  }

  function reconcileVoiceCalls() {
    if (!S.voice.joined || S.voice.context?.kind !== 'channel' || S.active.kind !== 'channel' || S.active.id !== S.voice.context.id) return;
    const voicePeople = members().filter((m) => m.voice && m.slug !== S.slug && m.slug);
    const valid = new Set(voicePeople.map((m) => m.peerId));
    for (const [peerId, call] of [...S.voice.calls.entries()]) {
      if (!valid.has(peerId)) closeVoiceCall(peerId, call);
    }
    for (const person of voicePeople) {
      if (S.voice.calls.has(person.peerId)) continue;
      if (S.slug > person.slug) makeVoiceCall(person.peerId, person.username, 'channel');
    }
  }

  async function toggleVoice() {
    if (voiceIsCurrent()) { stopVoice(); return; }
    if (S.voice.joined) stopVoice(false);
    if (!S.identity?.open) { toast('You are offline', 'Reconnect before starting voice.', 'error'); return; }
    if (S.active.kind === 'dm') {
      const t = thread();
      if (!t?.conn?.open) { toast('They are offline', 'You can call once you are both connected.', 'info'); return; }
      try {
        const stream = await requestMic();
        S.voice.stream = stream; S.voice.joined = true; S.voice.context = { kind: 'dm', slug: t.slug };
        const call = makeVoiceCall(userPeerId(t.slug), t.username, 'dm');
        if (!call) throw new Error('The call could not start.');
        S.voice.calling = t.username;
        setTimeout(() => {
          if (S.voice.context?.kind === 'dm' && S.voice.context.slug === t.slug && !S.voice.calls.size) { toast('No answer', `@${t.username} did not answer.`, 'info'); stopVoice(false); }
        }, 25000);
        paint(); paintHeading();
      } catch (error) {
        toast('Could not start the call', error?.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'Check your microphone and try again.', 'error');
      }
      return;
    }
    const c = S.channel;
    if (!c.joined) { toast('Join a channel first', 'Voice belongs to the channel you are in.', 'info'); return; }
    try {
      const stream = await requestMic();
      S.voice.stream = stream; S.voice.joined = true; S.voice.context = { kind: 'channel', id: c.id };
      if (c.hosting) syncHostMembers(c);
      else { setSelfMemberVoice(true); safeSend(c.hostConn, { t: 'voice', on: true }); }
      paint(); reconcileVoiceCalls();
    } catch (error) {
      toast('Could not start voice', error?.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'Check your microphone and try again.', 'error');
    }
  }

  function stopVoice(notify = true) {
    const context = S.voice.context;
    if (notify !== false && context?.kind === 'channel' && S.channel.joined) {
      if (S.channel.hosting) { /* state is recomputed below */ }
      else safeSend(S.channel.hostConn, { t: 'voice', on: false });
    }
    if (S.voice.incoming?.call) { try { S.voice.incoming.call.close(); } catch {} }
    if (S.voice.incoming?.timer) clearTimeout(S.voice.incoming.timer);
    S.voice.calls.forEach((call) => { try { call.close(); } catch {} });
    S.voice.audios.forEach((audio) => { try { audio.pause(); audio.srcObject = null; audio.remove(); } catch {} });
    try { (S.voice.stream?.getTracks?.() || []).forEach((track) => track.stop()); } catch {}
    S.voice = makeVoice();
    setSelfMemberVoice(false);
    if (S.channel.hosting) syncHostMembers(S.channel);
    paint(); paintHeading();
  }

  function answerIncomingVoice() {
    const incoming = S.voice.incoming;
    if (!incoming?.call) return;
    clearTimeout(incoming.timer);
    S.voice.incoming = null; paintCall();
    (async () => {
      try {
        const stream = await requestMic();
        S.voice.stream = stream; S.voice.joined = true;
        S.voice.context = { kind: 'dm', slug: incoming.slug };
        incoming.call.answer(stream);
        S.voice.calls.set(incoming.call.peer, incoming.call);
        incoming.call.on('stream', (remote) => attachPeerAudio(incoming.call.peer, remote));
        incoming.call.on('close', () => closeVoiceCall(incoming.call.peer, incoming.call));
        incoming.call.on('error', () => closeVoiceCall(incoming.call.peer, incoming.call));
        if (incoming.slug) {
          const t = getThread(incoming.username || incoming.slug);
          if (t) { S.active = { kind: 'dm', slug: t.slug }; t.unread = 0; }
          paint();
        }
      } catch (error) {
        try { incoming.call.close(); } catch {}
        toast('Could not answer', error?.name === 'NotAllowedError' ? 'Microphone access was blocked.' : 'Check your microphone and try again.', 'error');
        paint();
      }
    })();
  }

  function declineIncomingVoice() {
    const incoming = S.voice.incoming;
    if (incoming?.call) { try { incoming.call.close(); } catch {} }
    if (incoming?.timer) clearTimeout(incoming.timer);
    S.voice.incoming = null; paintCall();
  }

  function receiveMediaCall(call) {
    if (!call) return;
    const meta = call.metadata && typeof call.metadata === 'object' ? call.metadata : {};
    if (meta.kind === 'stream') { receiveStreamCall(call, meta); return; }
    const username = cleanName(meta.username) || 'Someone';
    const channelCall = meta.context === 'channel';
    if (S.voice.joined && S.voice.stream && channelCall && S.voice.context?.kind === 'channel') {
      try { call.answer(S.voice.stream); } catch {}
      S.voice.calls.set(call.peer, call);
      call.on('stream', (stream) => attachPeerAudio(call.peer, stream));
      call.on('close', () => closeVoiceCall(call.peer, call));
      call.on('error', () => closeVoiceCall(call.peer, call));
      paintCall(); return;
    }
    if (S.voice.incoming) { try { call.close(); } catch {} return; }
    S.voice.incoming = {
      call, username, slug: cleanSlug(username),
      timer: setTimeout(() => { if (S.voice.incoming?.call === call) { try { call.close(); } catch {} S.voice.incoming = null; paintCall(); } }, 30000)
    };
    paintCall();
  }

  function sendTypingSignal(active) {
    if (S.active.kind === 'dm') safeSend(thread()?.conn, { t: 'typing', active: !!active });
  }
  /* ---------------- reels ---------------- */

  function openMediaDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('This browser cannot store videos.')); return; }
      const req = indexedDB.open(MEDIA_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('reels')) req.result.createObjectStore('reels', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Video storage is unavailable.'));
    }).catch((error) => { dbPromise = null; throw error; });
    return dbPromise;
  }

  async function dbPut(record) {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reels', 'readwrite'); tx.objectStore('reels').put(record);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(id) {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reels', 'readonly'), req = tx.objectStore('reels').get(id);
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
  }

  async function dbAll() {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reels', 'readonly'), req = tx.objectStore('reels').getAll();
      req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(id) {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reels', 'readwrite'); tx.objectStore('reels').delete(id);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }

  async function loadLocalReels() {
    try {
      const rows = await dbAll();
      rows.forEach((row) => { if (row?.id && row.meta) S.localReels.set(row.id, row); });
      syncOwnReels();
    } catch {}
  }

  function localReelsForChannel(channelId) {
    return [...S.localReels.values()].map((row) => sanitizeReel(row.meta)).filter((r) => r && r.channelId === channelId);
  }

  function findLocalReel(id) { return S.localReels.get(String(id || '')) || null; }

  function sanitizeReel(value) {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const channelId = CHANNELS.some((c) => c.id === value.channelId) ? value.channelId : '';
    const username = cleanName(value.username), slug = cleanSlug(username);
    const mediaId = String(value.mediaId || id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const caption = cleanText(value.caption, 160);
    if (!id || !channelId || !username || !slug || !mediaId || !caption) return null;
    const rawSize = Number(value.size) || 0;
    return {
      id, mediaId, channelId, username, slug, caption,
      mime: /^video\/(mp4|webm|quicktime|ogg)$/.test(String(value.mime || '')) ? String(value.mime) : 'video/mp4',
      size: Math.max(0, Math.min(rawSize, MAX_REEL_BYTES)),
      duration: Math.max(0, Math.min(Number(value.duration) || 0, 180)),
      createdAt: Math.max(0, Number(value.createdAt) || Date.now()),
      likes: Array.isArray(value.likes) ? [...new Set(value.likes.map(cleanSlug).filter(Boolean))].slice(0, 80) : [],
      views: Math.max(0, Math.min(Number(value.views) || 0, 99999999)),
      peerId: String(value.peerId || userPeerId(slug)).slice(0, 120)
    };
  }

  function normalizeReels(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(sanitizeReel).filter((r) => { if (!r || seen.has(r.id)) return false; seen.add(r.id); return true; }).slice(-MAX_REELS);
  }

  function syncOwnReels() {
    if (!S.channel.joined || !S.identity?.open) return;
    const mine = localReelsForChannel(S.channel.id);
    if (!mine.length) return;
    if (S.channel.hosting) {
      mine.forEach((reel) => {
        if (!S.channel.reels.some((r) => r.id === reel.id)) S.channel.reels.push(reel);
      });
      broadcastChannel({ t: 'reels', reels: S.channel.reels }); paintReels(); return;
    }
    mine.forEach((reel) => safeSend(S.channel.hostConn, { t: 'reel-add', reel }));
  }

  function announceReel(reel) {
    if (!reel || !S.channel.joined) return;
    if (S.channel.hosting) {
      if (!S.channel.reels.some((r) => r.id === reel.id)) {
        if (S.channel.reels.length >= MAX_REELS) { toast('Channel is full of reels', 'Ask someone to remove one before sharing another.', 'info'); return; }
        S.channel.reels.push(reel);
      }
      broadcastChannel({ t: 'reels', reels: S.channel.reels }); paintReels();
    } else safeSend(S.channel.hostConn, { t: 'reel-add', reel });
  }

  function hostAddReel(channel, raw, guest) {
    const reel = sanitizeReel(raw);
    if (!reel || reel.channelId !== channel.id || reel.slug !== guest.slug) return;
    if (channel.reels.length >= MAX_REELS) { safeSend(guest.conn, { t: 'reel-full' }); return; }
    if (channel.reels.some((r) => r.id === reel.id)) return;
    reel.peerId = guest.peerId; reel.likes = []; reel.views = 0;
    channel.reels.push(reel);
    broadcastChannel({ t: 'reels', reels: channel.reels }); paintReels();
  }

  function hostToggleReelLike(channel, id, slug) {
    const reel = channel.reels.find((r) => r.id === id); if (!reel || !slug) return;
    const at = reel.likes.indexOf(slug);
    if (at >= 0) reel.likes.splice(at, 1); else reel.likes.push(slug);
    if (reel.likes.length > 80) reel.likes = reel.likes.slice(-80);
    broadcastChannel({ t: 'reels', reels: channel.reels });
    if (S.reelView?.id === id) S.reelView = { ...S.reelView, ...reel }; paintReelWatch();
    paintReels();
  }

  function hostViewReel(channel, id) {
    const reel = channel.reels.find((r) => r.id === id); if (!reel) return;
    reel.views = (Number(reel.views) || 0) + 1;
    broadcastChannel({ t: 'reels', reels: channel.reels });
  }

  function toggleReelLike(id) {
    const reel = S.channel.reels.find((r) => r.id === id); if (!reel) return;
    if (S.channel.hosting) hostToggleReelLike(S.channel, id, S.slug);
    else safeSend(S.channel.hostConn, { t: 'reel-like', id });
    if (S.reelView?.id === id) {
      const likes = new Set(S.reelView.likes || []);
      likes.has(S.slug) ? likes.delete(S.slug) : likes.add(S.slug);
      S.reelView = { ...S.reelView, likes: [...likes] };
      paintReelWatch();
    }
  }

  function noteReelView(id) {
    if (S.channel[`viewed-${id}`]) return;
    S.channel[`viewed-${id}`] = true;
    if (S.channel.hosting) hostViewReel(S.channel, id);
    else safeSend(S.channel.hostConn, { t: 'reel-view', id });
  }

  async function probeVideo(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file), video = document.createElement('video');
      let done = false;
      const finish = (duration = 0, poster = '') => {
        if (done) return; done = true;
        try { video.removeAttribute('src'); video.load(); } catch {}
        URL.revokeObjectURL(url); resolve({ duration, poster });
      };
      video.preload = 'metadata'; video.muted = true; video.playsInline = true; video.src = url;
      video.onloadedmetadata = () => {
        const duration = Number(video.duration) || 0;
        video.onseeked = () => {
          let poster = '';
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 540; canvas.height = Math.round(540 * (video.videoHeight / Math.max(1, video.videoWidth)) || 960);
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
            poster = canvas.toDataURL('image/jpeg', .72);
          } catch {}
          finish(duration, poster);
        };
        try { video.currentTime = Math.min(.5, duration / 3); } catch { finish(duration, ''); }
      };
      video.onerror = () => finish(0, '');
      setTimeout(() => finish(Number(video.duration) || 0, ''), 7000);
    });
  }

  async function addReelFile(file, caption) {
    if (reelBusy) return;
    const text = cleanText(caption, 160);
    if (!file) { toast('Choose a video first', 'Pick a short video from your device.', 'info'); return; }
    if (!file.type.startsWith('video/')) { toast('That is not a video', 'Choose an MP4, WebM, or MOV file.', 'error'); return; }
    if (file.size > MAX_REEL_BYTES) { toast('That video is too big', 'Reels need to stay under 15 MB.', 'error'); return; }
    if (!text) { toast('Add a caption', 'Give people a line so they know what they are watching.', 'info'); return; }
    if (!S.channel.joined) { toast('Open a channel first', 'Reels are shared inside a channel.', 'info'); return; }
    reelBusy = true; paintReels();
    try {
      const { duration, poster } = await probeVideo(file);
      if (!duration || duration > 180) { toast('Keep it short', 'Reels can be up to three minutes long.', 'error'); return; }
      const id = `reel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const reel = sanitizeReel({
        id, mediaId: id, channelId: S.channel.id, username: S.username, slug: S.slug, caption: text,
        mime: file.type, size: file.size, duration, createdAt: Date.now(), likes: [], views: 0,
        peerId: S.identity?.id || userPeerId(S.slug)
      });
      if (!reel) throw new Error('reel');
      const record = { id, meta: reel, blob: file, poster: poster || '', savedAt: Date.now() };
      await dbPut(record);
      S.localReels.set(id, record);
      rememberUrl(id, URL.createObjectURL(file));
      announceReel(reel);
      S.reelSheetOpen = false;
      paintReels();
      openReel(reel.id);
      toast('Reel shared', `It is now in #${S.channel.info.name}.`, 'success');
    } catch (error) {
      toast('Could not share that video', error?.name === 'QuotaExceededError' ? 'Your browser storage is full. Remove a reel and try again.' : 'Try a different video file.', 'error');
    } finally {
      reelBusy = false; paintReels();
    }
  }

  function rememberUrl(id, url) {
    const old = S.objectUrls.get(id); if (old && old !== url) { try { URL.revokeObjectURL(old); } catch {} }
    S.objectUrls.set(id, url);
  }

  async function blobForReel(reel) {
    if (!reel) throw new Error('missing');
    const cached = S.objectUrls.get(reel.id);
    if (cached) return cached;
    let row = null;
    try { row = await dbGet(reel.id); } catch {}
    if (row?.blob) { const url = URL.createObjectURL(row.blob); rememberUrl(reel.id, url); return url; }
    if (reel.slug === S.slug) {
      row = findLocalReel(reel.id);
      if (row?.blob) { const url = URL.createObjectURL(row.blob); rememberUrl(reel.id, url); return url; }
    }
    const blob = await fetchReelBlob(reel);
    const url = URL.createObjectURL(blob); rememberUrl(reel.id, url);
    try { await dbPut({ id: reel.id, meta: reel, blob, poster: row?.poster || '', savedAt: Date.now() }); } catch {}
    return url;
  }

  function bufferToBase64(buffer) {
    let out = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function serveReel(conn, request) {
    const id = String(request.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const row = S.localReels.get(id);
    if (!row?.blob || row.meta?.channelId !== request.channelId) { safeSend(conn, { t: 'reel-fail', id }); try { conn.close(); } catch {} return; }
    try {
      safeSend(conn, { t: 'reel-start', id, size: row.blob.size, mime: row.meta.mime || row.blob.type });
      for (let offset = 0; offset < row.blob.size; offset += REEL_CHUNK) {
        if (!conn.open) return;
        const chunk = await row.blob.slice(offset, offset + REEL_CHUNK).arrayBuffer();
        safeSend(conn, { t: 'reel-chunk', id, data: bufferToBase64(chunk) });
        await wait(12);
      }
      safeSend(conn, { t: 'reel-end', id });
      setTimeout(() => { try { conn.close(); } catch {} }, 800);
    } catch {
      safeSend(conn, { t: 'reel-fail', id }); try { conn.close(); } catch {}
    }
  }

  function fetchReelBlob(reel) {
    return new Promise((resolve, reject) => {
      if (!S.identity?.open) { reject(new Error('offline')); return; }
      if (S.reelView?.id === reel.id) { S.reelView.progress = 1; paintReelWatch(); }
      const target = userPeerId(reel.slug);
      let conn = null, settled = false, total = 0, mime = 'video/mp4', pieces = [];
      const timer = setTimeout(() => fail(new Error('timeout')), 90000);
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); try { conn?.close(); } catch {} resolve(new Blob(pieces, { type: mime })); };
      const fail = (error) => { if (settled) return; settled = true; clearTimeout(timer); try { conn?.close(); } catch {} reject(error); };
      try { conn = S.identity.connect(target, { reliable: true, serialization: 'json' }); } catch { fail(new Error('offline')); return; }
      conn.on('open', () => safeSend(conn, { t: 'reel-get', id: reel.id, mediaId: reel.mediaId, channelId: reel.channelId }));
      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (data.t === 'reel-fail') { fail(new Error('unavailable')); return; }
        if (data.t === 'reel-start') { total = Number(data.size) || 0; mime = String(data.mime || 'video/mp4'); return; }
        if (data.t === 'reel-chunk') {
          try { pieces.push(base64ToBytes(data.data)); } catch {}
          if (S.reelView?.id === reel.id && total) { S.reelView.progress = Math.min(.97, pieces.length * REEL_CHUNK / total); paintReelWatch(); }
          return;
        }
        if (data.t === 'reel-end') finish();
      });
      conn.on('error', fail); conn.on('close', () => { if (!settled) fail(new Error('closed')); });
    });
  }

  async function openReel(id) {
    const reel = S.channel.reels.find((r) => r.id === id);
    if (!reel) return;
    S.reelView = { ...reel, mediaUrl: S.objectUrls.get(id) || '', loading: true, progress: 0, error: '' };
    paintReelWatch(); noteReelView(id);
    try {
      const url = await blobForReel(reel);
      if (S.reelView?.id !== id) return;
      S.reelView = { ...S.reelView, mediaUrl: url, loading: false, progress: 1 }; paintReelWatch();
    } catch {
      if (S.reelView?.id !== id) return;
      S.reelView = { ...S.reelView, loading: false, error: 'This video could not be loaded. The uploader may be offline.' }; paintReelWatch();
    }
  }

  function closeReel() {
    const video = $('[data-sc-reel-video]', shell); if (video) { try { video.pause(); } catch {} }
    S.reelView = null; paintReelWatch();
  }

  function paintReels() {
    const node = $('[data-sc-pane="reels"]', shell); if (!node) return;
    const c = S.channel, list = [...c.reels].sort((a, b) => b.createdAt - a.createdAt);
    const canPost = c.joined && !!S.identity?.open;
    const sheet = S.reelSheetOpen ? `<form class="sc-reel-sheet" data-sc-reel-form>
      <div class="sc-sheet-top"><div><span class="sc-kicker">New reel</span><h3>Share something short</h3></div><button type="button" class="sc-quiet-btn" data-sc-reel-cancel>Cancel</button></div>
      <label class="sc-file-drop" data-sc-file-drop><input type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg" data-sc-reel-file><span class="sc-file-icon">${icon('upload')}</span><span data-sc-file-label>Choose a video</span><small>Up to 15 MB and three minutes</small></label>
      <label class="sc-field"><span>Caption</span><input data-sc-reel-caption maxlength="160" placeholder="What are we watching?" required></label>
      <p class="sc-sheet-note">Your video is sent straight to people watching. It is not posted publicly or uploaded to a server.</p>
      <button class="sc-primary-btn" type="submit" ${reelBusy ? 'disabled' : ''}>${reelBusy ? 'Preparing...' : 'Share reel'}</button>
    </form>` : '';
    node.innerHTML = `<div class="sc-section-bar"><div><span class="sc-kicker">${esc(c.info.topic)}</span><h3>${list.length ? `${list.length} reel${list.length === 1 ? '' : 's'} in ${channelLabel()}` : 'No reels here yet'}</h3></div>${canPost ? `<button class="sc-primary-btn" type="button" data-sc-reel-new ${S.reelSheetOpen ? 'hidden' : ''}>${icon('plus')} New reel</button>` : ''}</div>
      ${sheet}
      ${list.length ? `<div class="sc-reel-grid">${list.map(reelCardHTML).join('')}</div>` : `<div class="sc-empty-card"><span>${icon('clapperboard')}</span><h3>Be the first to post</h3><p>A reel is a short video from your day, a game clip, or something you made. Everyone in ${channelLabel()} can watch it.</p>${canPost ? '<button type="button" data-sc-reel-new>Create a reel</button>' : '<p class="sc-quiet">Reconnecting to the channel...</p>'}</div>`}
      <p class="sc-section-fine">Reels stay inside this channel. The person who posted sends the video directly to viewers when they press play.</p>`;
    refreshIcons(node);
  }

  function reelCardHTML(reel) {
    const row = S.localReels.get(reel.id);
    const poster = row?.poster ? `<img src="${esc(row.poster)}" alt="">` : `<span class="sc-reel-placeholder">${icon('play')}</span>`;
    const liked = (reel.likes || []).includes(S.slug);
    return `<article class="sc-reel-card"><button class="sc-reel-media" type="button" data-sc-reel-open="${esc(reel.id)}"><span class="sc-reel-poster">${poster}<span class="sc-reel-play">${icon('play')}</span><span class="sc-reel-duration">${reel.duration ? `${Math.floor(reel.duration / 60)}:${String(Math.floor(reel.duration % 60)).padStart(2, '0')}` : 'video'}</span></span></button>
      <div class="sc-reel-copy"><div class="sc-reel-by"><span class="sc-avatar">${esc(initial(reel.username))}</span><span><strong>@${esc(reel.username)}</strong><small>${ageText(reel.createdAt)}</small></span></div><p>${esc(reel.caption)}</p><div class="sc-reel-stats"><button type="button" class="${liked ? 'is-liked' : ''}" data-sc-reel-like="${esc(reel.id)}">${icon('heart')} ${(reel.likes || []).length}</button><span>${icon('eye')} ${reel.views || 0}</span><span>${icon('message-circle')} ${esc(channelLabel(reel.channelId))}</span></div></div></article>`;
  }

  function paintReelWatch() {
    const node = $('[data-sc-reel-watch]', shell), reel = S.reelView;
    if (!node) return;
    if (!reel) { node.hidden = true; node.innerHTML = ''; return; }
    node.hidden = false;
    const likes = (reel.likes || []).length;
    node.innerHTML = `<div class="sc-watch-bg"></div><section class="sc-watch" role="dialog" aria-label="Reel from ${esc(reel.username)}">
      <header><span class="sc-avatar">${esc(initial(reel.username))}</span><div><strong>@${esc(reel.username)}</strong><small>${esc(channelLabel(reel.channelId))} · ${ageText(reel.createdAt)}</small></div><button type="button" data-sc-reel-close aria-label="Close reel">${icon('x')}</button></header>
      <div class="sc-watch-media">${reel.mediaUrl ? `<video data-sc-reel-video src="${esc(reel.mediaUrl)}" autoplay playsinline controls loop></video>` : reel.error ? `<div class="sc-watch-error">${icon('video-off')}<strong>${esc(reel.error)}</strong></div>` : `<div class="sc-watch-loading"><span></span><p>Loading video ${Math.round((reel.progress || 0) * 100)}%</p></div>`}</div>
      <footer><p>${esc(reel.caption)}</p><div class="sc-watch-actions"><button type="button" class="${(reel.likes || []).includes(S.slug) ? 'is-liked' : ''}" data-sc-reel-like="${esc(reel.id)}">${icon('heart')} ${likes}</button><span>${icon('eye')} ${reel.views || 0}</span><span>${icon('send')} Shared in ${esc(channelLabel(reel.channelId))}</span></div></footer>
    </section></div>`;
    refreshIcons(node);
  }

  function removeReelLocal(id) {
    if (!confirm('Remove this reel from this device? It will no longer be available here.')) return;
    (async () => {
      try { await dbDelete(id); } catch {}
      S.localReels.delete(id);
      const url = S.objectUrls.get(id); if (url) { try { URL.revokeObjectURL(url); } catch {} S.objectUrls.delete(id); }
      S.channel.reels = S.channel.reels.filter((r) => r.id !== id);
      if (S.channel.hosting) broadcastChannel({ t: 'reels', reels: S.channel.reels });
      if (S.reelView?.id === id) closeReel();
      paintReels(); toast('Reel removed', 'It was removed from this device.', 'success');
    })();
  }
  /* ---------------- live streams ---------------- */

  function sanitizeStream(value) {
    if (!value || typeof value !== 'object') return null;
    const id = String(value.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const channelId = CHANNELS.some((c) => c.id === value.channelId) ? value.channelId : '';
    const username = cleanName(value.username), slug = cleanSlug(username);
    const title = cleanText(value.title, 90), game = cleanText(value.game, 60);
    if (!id || !channelId || !username || !slug || !title) return null;
    return {
      id, channelId, username, slug, title, game: game || 'Screen share',
      startedAt: Math.max(0, Number(value.startedAt) || Date.now()),
      viewers: Math.max(0, Math.min(Number(value.viewers) || 0, 999)),
      peerId: String(value.peerId || userPeerId(slug)).slice(0, 120)
    };
  }

  function normalizeStreams(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(sanitizeStream).filter((s) => { if (!s || seen.has(s.id)) return false; seen.add(s.id); return true; }).slice(0, 40);
  }

  function announceOwnStream() {
    const live = S.live.broadcasting;
    if (!live || !S.channel.joined) return;
    live.streamRecord.channelId = S.channel.id;
    live.streamRecord.peerId = S.identity?.id || userPeerId(S.slug);
    if (S.channel.hosting) {
      S.channel.streams = S.channel.streams.filter((s) => s.slug !== S.slug);
      S.channel.streams.push(live.streamRecord);
      broadcastChannel({ t: 'streams', streams: S.channel.streams });
    } else safeSend(S.channel.hostConn, { t: 'stream-add', stream: live.streamRecord });
    paintLive();
  }

  function hostAddStream(channel, raw, guest) {
    const stream = sanitizeStream(raw);
    if (!stream || stream.channelId !== channel.id || stream.slug !== guest.slug) return;
    channel.streams = channel.streams.filter((s) => s.slug !== guest.slug);
    channel.streams.push({ ...stream, peerId: guest.peerId, viewers: 0 });
    broadcastChannel({ t: 'streams', streams: channel.streams });
    paintLive();
  }

  function hostRemoveStream(channel, id, slug) {
    const stream = channel.streams.find((s) => s.id === id);
    if (!stream || (stream.slug !== slug && stream.slug !== S.slug)) return;
    channel.streams = channel.streams.filter((s) => s.id !== id);
    broadcastChannel({ t: 'streams', streams: channel.streams });
    paintLive();
  }

  function hostStreamStats(channel, id, slug, viewers) {
    const stream = channel.streams.find((s) => s.id === id && s.slug === slug);
    if (!stream) return;
    stream.viewers = Math.max(0, Math.min(Number(viewers) || 0, MAX_STREAM_VIEWERS));
    broadcastChannel({ t: 'streams', streams: channel.streams });
    paintLive();
  }

  function updateClock() {
    const nodes = $$('[data-sc-live-clock]', shell); if (!nodes.length) return;
    const at = S.live.watching?.stream?.startedAt || S.live.broadcasting?.streamRecord?.startedAt;
    if (!at) return;
    const secs = Math.max(0, Math.floor((Date.now() - at) / 1000));
    const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    nodes.forEach((node) => { node.textContent = text; });
  }

  async function startBroadcast(form) {
    if (S.live.broadcasting) return;
    if (!S.channel.joined) { toast('Open a channel first', 'Live streams belong to the channel you are in.', 'info'); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { toast('Screen sharing is unavailable', 'This browser cannot share a screen.', 'error'); return; }
    const title = cleanText(form?.title, 90), game = cleanText(form?.game, 60);
    if (!title) { toast('Name your stream', 'Give people a title so they know what is live.', 'info'); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true
      });
      if (!stream.getVideoTracks().length) throw new Error('video');
      stopWatching(); stopVoice(false);
      const record = sanitizeStream({
        id: `live_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        channelId: S.channel.id, username: S.username, slug: S.slug, title, game,
        startedAt: Date.now(), viewers: 0, peerId: S.identity?.id || userPeerId(S.slug)
      });
      S.live.broadcasting = { stream, streamRecord: record, viewers: new Map() };
      stream.getVideoTracks()[0].addEventListener('ended', () => stopBroadcast());
      S.live.startOpen = false; S.section = 'live';
      announceOwnStream(); paintLive();
      clearInterval(S.live.clock); S.live.clock = setInterval(updateClock, 1000);
      toast('You are live', `People in ${channelLabel()} can now watch.`, 'success');
    } catch (error) {
      if (error?.name !== 'NotAllowedError') toast('Could not start streaming', 'Choose a screen or window to share. If you cancelled, nothing was started.', 'info');
    }
  }

  function stopBroadcast(announce = true) {
    const live = S.live.broadcasting;
    if (!live) return;
    try { live.stream.getTracks().forEach((track) => track.stop()); } catch {}
    live.viewers.forEach((viewer) => {
      safeSend(viewer.conn, { t: 'stream-ended' });
      try { viewer.conn.close(); } catch {}
      try { viewer.call?.close(); } catch {}
    });
    live.viewers.clear();
    if (announce) {
      if (S.channel.hosting) {
        S.channel.streams = S.channel.streams.filter((s) => s.id !== live.streamRecord.id);
        broadcastChannel({ t: 'streams', streams: S.channel.streams });
      } else safeSend(S.channel.hostConn, { t: 'stream-remove', id: live.streamRecord.id });
    }
    S.live.broadcasting = null;
    clearInterval(S.live.clock); S.live.clock = 0;
    paintLive(); paintLiveStage();
  }

  function receiveStreamCall(call, meta) {
    const watching = S.live.watching;
    if (!watching || String(meta.streamId || '') !== watching.stream.id) { try { call.close(); } catch {} return; }
    try { call.answer(); } catch { endWatch('The stream could not connect.'); return; }
    if (S.live.watchCall) { try { S.live.watchCall.close(); } catch {} }
    S.live.watchCall = call;
    call.on('stream', (remote) => {
      if (!S.live.watching) { try { call.close(); } catch {} return; }
      S.live.remoteStream = remote;
      S.live.watching.state = 'playing';
      paintLive();
    });
    call.on('close', () => {
      if (S.live.watchCall === call) S.live.watchCall = null;
      if (S.live.watching) endWatch('The stream ended.');
    });
    call.on('error', () => { if (S.live.watching) endWatch('The stream was interrupted.'); });
  }

  async function watchStream(stream) {
    if (!stream || !S.identity?.open) return;
    if (S.live.watching) endWatch('', false);
    if (S.live.broadcasting) { toast('You are live', 'Stop your stream before watching another one.', 'info'); return; }
    stopVoice(false);
    S.section = 'live'; S.live.startOpen = false;
    S.live.watching = { stream, state: 'connecting', chat: '', error: '' }; paintLive();
    const target = userPeerId(stream.slug);
    let conn = null, settled = false;
    const timer = setTimeout(() => { if (!settled) endWatch('The streamer did not answer.', true); }, 18000);
    try { conn = S.identity.connect(target, { reliable: true, serialization: 'json' }); }
    catch { clearTimeout(timer); endWatch('The streamer is offline.', true); return; }
    S.live.watchConn = conn;
    conn.on('open', () => safeSend(conn, { t: 'stream-join', id: stream.id, username: S.username, slug: S.slug }));
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object' || !S.live.watching) return;
      if (data.t === 'stream-ready') { settled = true; clearTimeout(timer); return; }
      if (data.t === 'stream-full') { settled = true; clearTimeout(timer); endWatch('This stream has all its viewers right now.', true); return; }
      if (data.t === 'stream-fail' || data.t === 'stream-ended') { settled = true; clearTimeout(timer); endWatch(data.t === 'stream-ended' ? 'The stream ended.' : 'The streamer is no longer live.', true); }
    });
    conn.on('close', () => { if (S.live.watching && S.live.watching.state !== 'playing') endWatch('The streamer went offline.', true); });
    conn.on('error', () => { if (S.live.watching) endWatch('The stream was interrupted.', true); });
  }

  function endWatch(message, notify) {
    const watching = S.live.watching;
    if (!watching) return;
    try { S.live.watchConn?.close(); } catch {}
    try { S.live.watchCall?.close(); } catch {}
    S.live.watchConn = null; S.live.watchCall = null; S.live.watching = null; S.live.remoteStream = null;
    if (message) toast('Stream ended', message, 'info');
    paintLive();
  }

  function stopWatching() { if (S.live.watching) endWatch('', false); }

  function serveStreamJoin(conn, data) {
    const live = S.live.broadcasting;
    if (!live || live.streamRecord.id !== data.id) { safeSend(conn, { t: 'stream-fail' }); try { conn.close(); } catch {} return; }
    const slug = cleanSlug(data.slug) || cleanSlug(data.username);
    if (!slug || conn.peer !== userPeerId(slug)) { safeSend(conn, { t: 'stream-fail' }); try { conn.close(); } catch {} return; }
    if (live.viewers.has(conn.peer)) { const old = live.viewers.get(conn.peer); try { old.conn.close(); } catch {} live.viewers.delete(conn.peer); }
    if (live.viewers.size >= MAX_STREAM_VIEWERS) { safeSend(conn, { t: 'stream-full' }); try { conn.close(); } catch {} return; }
    let call = null;
    try { call = S.identity.call(conn.peer, live.stream, { metadata: { kind: 'stream', streamId: live.streamRecord.id, username: S.username, channelId: live.streamRecord.channelId } }); }
    catch { safeSend(conn, { t: 'stream-fail' }); try { conn.close(); } catch {} return; }
    if (!call) { safeSend(conn, { t: 'stream-fail' }); try { conn.close(); } catch {} return; }
    const viewer = { conn, call, username: cleanName(data.username), slug };
    live.viewers.set(conn.peer, viewer);
    safeSend(conn, { t: 'stream-ready' });
    conn.on('close', () => removeStreamViewer(conn));
    conn.on('error', () => removeStreamViewer(conn));
    call.on('close', () => { /* keep viewer connected; WebRTC reconnect needs a new join */ });
    updateStreamViewerCount();
  }

  function removeStreamViewer(conn) {
    const live = S.live.broadcasting;
    if (!live) return;
    const viewer = [...live.viewers.values()].find((v) => v.conn === conn); if (!viewer) return;
    live.viewers.delete(viewer.conn.peer);
    try { viewer.call?.close(); } catch {}
    try { viewer.conn.close(); } catch {}
    updateStreamViewerCount();
  }

  function updateStreamViewerCount() {
    const live = S.live.broadcasting;
    if (!live) return;
    const count = live.viewers.size;
    if (S.channel.hosting) {
      const record = S.channel.streams.find((s) => s.id === live.streamRecord.id);
      if (record) { record.viewers = count; broadcastChannel({ t: 'streams', streams: S.channel.streams }); }
    } else safeSend(S.channel.hostConn, { t: 'stream-stats', id: live.streamRecord.id, viewers: count });
    paintLive();
  }

  function refreshLiveVideo() {
    const video = $('[data-sc-live-video]', shell);
    if (!video) return;
    let stream = null;
    if (S.live.watching && S.live.remoteStream) stream = S.live.remoteStream;
    else if (S.live.broadcasting) stream = S.live.broadcasting.stream;
    if (stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play?.().catch(() => {});
    }
  }

  function paintLive() {
    const node = $('[data-sc-pane="live"]', shell); if (!node) return;
    const c = S.channel, live = S.live.broadcasting, watching = S.live.watching;
    const streams = [...c.streams].filter((s) => s.id !== live?.streamRecord?.id);
    if (live || watching) {
      const active = watching?.stream || live?.streamRecord;
      const isMine = !!live;
      const viewers = isMine ? live.viewers.size : active.viewers || 0;
      const chat = c.messages.slice(-70);
      const stateLabel = watching?.state === 'playing' ? 'Playing' : watching ? 'Connecting...' : 'Live now';
      node.innerHTML = `<div class="sc-live-room">
        <div class="sc-live-top"><button class="sc-back-live" type="button" data-sc-live-back>${icon('arrow-left')} All streams</button><span class="sc-live-pill"><i></i>${isMine ? 'You are live' : stateLabel}</span><span class="sc-live-clock" data-sc-live-clock>0:00</span><span class="sc-live-viewers">${icon('eye')} ${viewers}</span>${isMine ? `<button class="sc-live-stop" type="button" data-sc-stop-broadcast>${icon('square')} Stop stream</button>` : `<button class="sc-live-stop" type="button" data-sc-leave-stream>${icon('x')} Leave</button>`}</div>
        <div class="sc-live-layout"><div class="sc-live-stage"><div class="sc-live-video-wrap">${watching?.state !== 'playing' && !isMine ? `<div class="sc-live-connecting"><span></span><strong>Connecting to @${esc(active.username)}</strong><small>Setting up a direct connection...</small></div>` : ''}${watching?.error ? `<div class="sc-live-connecting"><strong>${esc(watching.error)}</strong></div>` : ''}<video data-sc-live-video autoplay playsinline ${isMine ? 'muted' : 'controls'}></video>${isMine ? '<span class="sc-live-preview-label">Preview of what people see</span>' : ''}</div><div class="sc-live-under"><div class="sc-live-host"><span class="sc-avatar">${esc(initial(active.username))}</span><div><strong>${esc(active.title)}</strong><span>@${esc(active.username)} · ${esc(active.game)}</span></div></div><p>${isMine ? `${MAX_STREAM_VIEWERS} viewer limit on direct streams. Keep this tab open.` : `You are watching ${channelLabel(c.id)} live.`}</p></div></div>
        <aside class="sc-live-chat"><header><span>${icon('message-circle')}</span><strong>Stream chat</strong><small>${esc(channelLabel(c.id))}</small></header><div class="sc-live-chat-list">${chat.length ? chat.filter((m) => !m.system).map((m) => `<p><strong>${esc(m.username)}</strong> ${esc(m.text)}</p>`).join('') : '<p class="sc-quiet">No messages yet. Say something.</p>'}</div><form class="sc-live-chat-form" data-sc-live-chat-form><input maxlength="240" placeholder="Say something..." aria-label="Stream chat"><button type="submit" aria-label="Send">${icon('send')}</button></form></aside></div>
      </div>`;
      refreshIcons(node); requestAnimationFrame(refreshLiveVideo); setTimeout(refreshLiveVideo, 60);
      clearInterval(S.live.clock); S.live.clock = setInterval(updateClock, 1000); updateClock();
      return;
    }
    const started = S.live.startOpen;
    node.innerHTML = `<div class="sc-live-landing"><section class="sc-live-hero"><div><span class="sc-kicker">Channel live</span><h3>Watch together.<br>No waiting room.</h3><p>Share your screen straight from the browser. People in ${channelLabel()} can watch and chat with you while you play.</p><div class="sc-live-hero-actions">${c.joined ? `<button class="sc-live-go" type="button" data-sc-live-start>${icon('radio')} Go live</button>` : '<span class="sc-quiet">Reconnecting to the channel...</span>'}<span>${icon('users')} ${MAX_STREAM_VIEWERS} viewers per stream</span></div></div><div class="sc-live-illustration"><span class="sc-live-ring"></span><span class="sc-live-screen">${icon('monitor-play')}</span><span class="sc-live-chat-chip">${icon('message-circle')} live chat</span></div></section>
      ${started ? `<form class="sc-live-form" data-sc-live-form><div class="sc-sheet-top"><div><span class="sc-kicker">Start a stream</span><h3>What are you playing?</h3></div><button class="sc-quiet-btn" type="button" data-sc-live-cancel>Cancel</button></div><label class="sc-field"><span>Stream title</span><input name="title" maxlength="90" placeholder="Late night ranked" required></label><label class="sc-field"><span>Game or activity</span><input name="game" maxlength="60" placeholder="Optional"></label><p class="sc-sheet-note">Your browser will ask which screen or window to share. Audio is included when the browser allows it.</p><button class="sc-primary-btn" type="submit">${icon('radio')} Start streaming</button></form>` : ''}
      <div class="sc-live-section-head"><div><span class="sc-kicker">Happening now</span><h3>Live in ${channelLabel()}</h3></div>${c.joined && !started ? `<button class="sc-text-btn" type="button" data-sc-live-start>${icon('plus')} Start a stream</button>` : ''}</div>
      ${streams.length ? `<div class="sc-stream-grid">${streams.map(streamCardHTML).join('')}</div>` : `<div class="sc-empty-card sc-live-empty"><span>${icon('radio')}</span><h3>No one is live yet</h3><p>When someone starts a stream, it will appear here. You can also be the first.</p></div>`}
      <p class="sc-section-fine">Streams are direct between browsers. This is built for a handful of viewers in a channel, not a public broadcast.</p></div>`;
    refreshIcons(node);
  }

  function streamCardHTML(stream) {
    return `<article class="sc-stream-card"><div class="sc-stream-art"><span>${icon('monitor-play')}</span><span class="sc-live-pill"><i></i>LIVE</span><span class="sc-stream-viewers">${icon('eye')} ${stream.viewers || 0}</span></div><div class="sc-stream-copy"><span class="sc-kicker">${esc(stream.game)}</span><h4>${esc(stream.title)}</h4><div class="sc-stream-by"><span class="sc-avatar">${esc(initial(stream.username))}</span><span>@${esc(stream.username)}</span><small>${ageText(stream.startedAt)}</small></div><button class="sc-primary-btn" type="button" data-sc-watch-stream="${esc(stream.id)}">${icon('play')} Watch</button></div></article>`;
  }

  function paintLiveStage() { paintLive(); }
  function paintLiveChat() {
    if (S.section !== 'live' || !S.live.watching || !$('[data-sc-live-chat-form]', shell)) return;
    const list = $('.sc-live-chat-list', shell);
    if (!list) return;
    const chat = S.channel.messages.slice(-70).filter((m) => !m.system);
    list.innerHTML = chat.length ? chat.map((m) => `<p><strong>${esc(m.username)}</strong> ${esc(m.text)}</p>`).join('') : '<p class="sc-quiet">No messages yet. Say something.</p>';
    list.scrollTop = list.scrollHeight;
  }
  /* ---------------- mount and events ---------------- */

  let boundShell = null;

  function mount(root) {
    if (!root) return;
    shell = root;
    if (!S.mounted) {
      S.mounted = true;
      S.setupValue = S.setupValue || suggestedName;
      if (!S.signedIn) S.username = '';
    } else if (S.identity && !S.identity.destroyed && !S.identity.disconnected && S.identityStatus === 'online') {
      S.identityStatus = 'online';
    }
    if (boundShell !== root) {
      boundShell = root;
      root.addEventListener('click', onClick);
      root.addEventListener('submit', onSubmit);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeyDown);
    }
    root.innerHTML = '';
    paint();
    if (S.signedIn) {
      if (!S.identity || S.identity.destroyed || S.identity.disconnected) resumeIdentity();
      else {
        S.identityStatus = 'online'; bindIdentityOnce(S.identity);
        loadLocalReels();
        if (!S.channel.joined && !S.channel.connecting) connectChannel(S.channel);
      }
    }
  }

  function bindIdentityOnce(peer) {
    if (!peer || peer.__flashSocialBound) return;
    peer.__flashSocialBound = true;
    bindIdentity(peer);
  }

  function closestAction(target, root = shell) {
    return target?.closest?.('[data-sc-section], [data-sc-channel], [data-sc-person-dm], [data-sc-dm-open], [data-sc-copy-username], [data-sc-retry-identity], [data-sc-banner-action], [data-sc-answer], [data-sc-decline], [data-sc-voice], [data-sc-mobile-back], [data-sc-reel-new], [data-sc-reel-cancel], [data-sc-reel-open], [data-sc-reel-like], [data-sc-reel-close], [data-sc-live-start], [data-sc-live-cancel], [data-sc-stop-broadcast], [data-sc-leave-stream], [data-sc-live-back], [data-sc-watch-stream], [data-sc-retry-channel], [data-sc-reel-file], [data-sc-live-video]');
  }

  function onClick(event) {
    if (!shell.contains(event.target)) return;
    const watch = event.target.closest('[data-sc-reel-watch]');
    if (watch && event.target === watch) { closeReel(); return; }
    const action = event.target.closest('button, [data-sc-person-dm]');
    if (!action || !shell.contains(action)) return;

    if (action.dataset.scSection) { setSection(action.dataset.scSection); return; }
    if (action.dataset.scChannel) { joinChannel(action.dataset.scChannel); return; }
    if (action.dataset.scDmOpen) { selectDm(action.dataset.scDmOpen); return; }
    if (action.dataset.scPersonDm) {
      const person = members().find((m) => m.slug === action.dataset.scPersonDm);
      if (person) startDm(person.username); return;
    }
    if (action.hasAttribute('data-sc-copy-username')) { copyText(`@${S.username}`, 'Your username is on the clipboard.'); return; }
    if (action.hasAttribute('data-sc-retry-identity')) { retryIdentity(); return; }
    if (action.hasAttribute('data-sc-banner-action')) {
      const kind = action.dataset.scBannerAction;
      if (kind === 'retry-identity') retryIdentity();
      else if (kind === 'retry-channel') { S.channel.error = ''; S.channel.connecting = false; connectChannel(S.channel); }
      else if (kind === 'retry-dm') { const t = thread(); if (t) { t.error = ''; connectDm(t); } }
      return;
    }
    if (action.hasAttribute('data-sc-retry-channel')) { S.channel.error = ''; S.channel.connecting = false; connectChannel(S.channel); return; }
    if (action.hasAttribute('data-sc-answer')) { answerIncomingVoice(); return; }
    if (action.hasAttribute('data-sc-decline')) { declineIncomingVoice(); return; }
    if (action.hasAttribute('data-sc-voice')) { toggleVoice(); return; }
    if (action.hasAttribute('data-sc-mobile-back')) { setMobile('rail'); paint(); return; }
    if (action.hasAttribute('data-sc-reel-new')) { S.section = 'reels'; S.reelSheetOpen = true; paint(); requestAnimationFrame(() => $('[data-sc-reel-file]', shell)?.focus()); return; }
    if (action.hasAttribute('data-sc-reel-cancel')) { S.reelSheetOpen = false; paintReels(); return; }
    if (action.dataset.scReelOpen) { openReel(action.dataset.scReelOpen); return; }
    if (action.dataset.scReelLike) { event.stopPropagation(); toggleReelLike(action.dataset.scReelLike); return; }
    if (action.hasAttribute('data-sc-reel-close')) { closeReel(); return; }
    if (action.hasAttribute('data-sc-live-start')) { S.section = 'live'; S.live.startOpen = true; paint(); requestAnimationFrame(() => $('[data-sc-live-form] input', shell)?.focus()); return; }
    if (action.hasAttribute('data-sc-live-cancel')) { S.live.startOpen = false; paintLive(); return; }
    if (action.hasAttribute('data-sc-stop-broadcast')) { stopBroadcast(); return; }
    if (action.hasAttribute('data-sc-leave-stream')) { endWatch(); return; }
    if (action.hasAttribute('data-sc-live-back')) { endWatch('', false); S.live.startOpen = false; paintLive(); return; }
    if (action.dataset.scWatchStream) {
      const stream = S.channel.streams.find((s) => s.id === action.dataset.scWatchStream);
      if (stream) watchStream(stream);
      return;
    }
  }

  function onSubmit(event) {
    if (!shell.contains(event.target)) return;
    const form = event.target;
    if (form.matches('[data-sc-setup]')) {
      event.preventDefault(); claimUsername($('[data-sc-setup-name]', form)?.value || S.setupValue);
      return;
    }
    if (form.matches('[data-sc-dm-form]')) {
      event.preventDefault(); startDm($('[data-sc-dm-name]', form)?.value || '');
      if (form.isConnected) { const input = $('[data-sc-dm-name]', form); if (input) input.value = ''; }
      return;
    }
    if (form.matches('[data-sc-composer]')) {
      event.preventDefault();
      const input = $('[data-sc-input]', form), text = input?.value || '';
      if (!text.trim()) return;
      if (sendChat(text)) { input.value = ''; paintComposer(); }
      input.focus(); return;
    }
    if (form.matches('[data-sc-reel-form]')) {
      event.preventDefault();
      const file = $('[data-sc-reel-file]', form)?.files?.[0];
      const caption = $('[data-sc-reel-caption]', form)?.value || '';
      addReelFile(file, caption); return;
    }
    if (form.matches('[data-sc-live-form]')) {
      event.preventDefault();
      const data = new FormData(form);
      startBroadcast({ title: data.get('title'), game: data.get('game') }); return;
    }
    if (form.matches('[data-sc-live-chat-form]')) {
      event.preventDefault();
      const input = $('input', form), text = input?.value || '';
      if (text.trim() && sendChat(text)) input.value = '';
      input?.focus(); return;
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.matches('[data-sc-setup-name]')) {
      S.setupValue = target.value;
      if (S.setupError) { S.setupError = ''; paintSetup(); target.focus(); }
      return;
    }
    if (target.matches('[data-sc-input]')) { noteTyping(); return; }
    if (target.matches('[data-sc-dm-name]')) { if (S.dmError) { S.dmError = ''; paintDms(); } }
  }

  function onChange(event) {
    if (event.target.matches('[data-sc-reel-file]')) {
      const file = event.target.files?.[0];
      const label = $('[data-sc-file-label]', event.target.closest('form') || shell);
      if (label) label.textContent = file ? file.name : 'Choose a video';
      return;
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (S.reelView) { closeReel(); return; }
      if (S.voice.incoming) { declineIncomingVoice(); return; }
      if (S.live.watching) { endWatch('', false); return; }
    }
    if (event.key === 'Enter' && event.target.matches('[data-sc-setup-name]')) {
      event.preventDefault(); $('[data-sc-setup]', shell)?.requestSubmit(); return;
    }
  }

  window.addEventListener('beforeunload', () => {
    try { stopVoice(false); } catch {}
    try { stopBroadcast(false); } catch {}
    try { endWatch('', false); } catch {}
    try { closeChannelTransport(S.channel); } catch {}
    try { S.identity?.destroy(); } catch {}
  });

  if (savedUsername) loadLocalReels();
  if (document.visibilityState !== 'hidden') {
    // no background heartbeat: connections recover through PeerJS and channel re-election
  }
})();
