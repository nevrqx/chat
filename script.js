/*
Настройка Supabase (минимально для запуска)
1) Вставьте ваши ключи ниже: SUPABASE_URL и SUPABASE_ANON_KEY
2) Создайте таблицы (SQL в Supabase -> SQL Editor) и хранилище:

-- Таблица пользователей
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  nick text not null unique,
  ip_hash text not null unique,
  created_at timestamp with time zone default now()
);

-- Таблица сообщений
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room_id text not null,              -- 'global' или для ЛС: 'dm:{id1}:{id2}'
  from_user uuid not null references public.users(id) on delete cascade,
  to_user uuid,                       -- для ЛС (необязательно для общего)
  content text,                       -- текст
  image_url text,                     -- ссылка на картинку в storage
  created_at timestamp with time zone default now()
);
create index if not exists idx_messages_room_created on public.messages(room_id, created_at desc);

-- Политики RLS (демо: максимально открыто; в проде ужесточите)
alter table public.users enable row level security;
alter table public.messages enable row level security;

create policy "users read" on public.users for select using (true);
create policy "users write" on public.users for insert with check (true);

create policy "messages read" on public.messages for select using (true);
create policy "messages write" on public.messages for insert with check (true);

-- Хранилище картинок
-- Создайте bucket: chat-images (public)
-- Storage -> Create bucket -> chat-images -> Public

*/

// ВСТАВЬТЕ СВОИ КЛЮЧИ
const SUPABASE_URL = "https://afhcocqkhbwegdgssiqc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_du1nENzM_6fNjCipOEZFdQ_PfEikISM";

// Инициализация клиента
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Элементы UI
const meNameEl = document.getElementById('meName');
const meIdEl = document.getElementById('meId');
const roomTitleEl = document.getElementById('roomTitle');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const searchInput = document.getElementById('searchInput');
const dmListEl = document.getElementById('dmList');
const globalChatItem = document.getElementById('globalChatItem');
const composerEl = document.querySelector('.composer');

const imageModal = document.getElementById('imageModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const modalImage = document.getElementById('modalImage');
// Reply UI
const replyBar = document.getElementById('replyBar');
const replyAuthorEl = document.getElementById('replyAuthor');
const replyTextEl = document.getElementById('replyText');
const replyCancelBtn = document.getElementById('replyCancel');
// Upload UI
const uploadBar = document.getElementById('uploadBar');
const uploadText = document.getElementById('uploadText');
// Mobile drawer UI
const menuBtn = document.getElementById('menuBtn');
const sidebarEl = document.querySelector('.sidebar');

// Состояние
let me = null; // { id, nick, ip_hash }
let deferredInstallPrompt = null; // для PWA «добавить на экран»

// PWA: регистрация сервис-воркера
async function registerSW() {
  try {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('sw.js', { scope: './' });
    }
  } catch (e) {
    console.warn('SW register fail:', e);
  }
}

// Ловим событие установки PWA
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

// Показать системный prompt установки (по явному жесту)
async function tryShowInstallPrompt() {
  if (!deferredInstallPrompt) return;
  try {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  } catch {}
  deferredInstallPrompt = null;
}

// Полноэкранный режим по первому жесту пользователя
function setupFullscreenOnce() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!isMobile()) return; // на ПК не запрашиваем фуллскрин
  if (isStandalone) return; // уже как приложение
  const onFirstGesture = async () => {
    document.removeEventListener('click', onFirstGesture, true);
    document.removeEventListener('touchend', onFirstGesture, true);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        await el.requestFullscreen();
      }
    } catch (e) { /* игнорируем отказ браузера */ }
  };
  document.addEventListener('click', onFirstGesture, true);
  document.addEventListener('touchend', onFirstGesture, true);
}

// Блокировки для ощущения "как приложение": отключаем контекстное меню, копирование и масштабирование
function setupAppLikeGuards() {
  // Разрешаем взаимодействие в интерактивных элементах
  const isEditable = (el) => {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

  // Отключаем контекстное меню
  document.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  }, { passive: false });

  // Блокируем копирование и вырезание
  document.addEventListener('copy', (e) => { if (!isEditable(e.target)) e.preventDefault(); });
  document.addEventListener('cut', (e) => { if (!isEditable(e.target)) e.preventDefault(); });

  // Блокируем Ctrl/Cmd масштабирование и жесты зума
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    const key = e.key;
    const zoomKeys = ['+', '-', '=', '0'];
    if ((e.ctrlKey || e.metaKey) && zoomKeys.includes(key)) {
      e.preventDefault();
    }
  });

  // iOS Safari жесты масштабирования
  window.addEventListener('gesturestart', (e) => e.preventDefault());
  window.addEventListener('gesturechange', (e) => e.preventDefault());
  window.addEventListener('gestureend', (e) => e.preventDefault());

  // Предотвращаем двойной тап зум на мобильных
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch <= 300) {
      e.preventDefault();
    }
    lastTouch = now;
  }, { passive: false });
}

// Глобальная подписка на все сообщения для обновления списка ЛС
let dmWatchChannel = null;
function subscribeDMWatch() {
  if (dmWatchChannel) supabase.removeChannel(dmWatchChannel);
  dmWatchChannel = supabase
    .channel('dm:watch')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      const m = payload.new;
      if (!m || !m.room_id || !m.room_id.startsWith('dm:')) return;
      const parts = m.room_id.split(':'); // dm:id1:id2
      if (parts.length !== 3) return;
      const [ , a, b ] = parts;
      if (a !== me.id && b !== me.id) return; // не наши ЛС
      const peerId = a === me.id ? b : a;
      // Получим ник собеседника
      const peer = await getUserById(peerId);
      const peerNick = peer?.nick || (peerId.slice(0,8)+'…');
      const snippet = m.content ? m.content : (m.image_url ? '[Изображение]' : '');
      const incUnread = (m.room_id !== currentRoomId) ? 1 : 0;
      upsertRecentDM({ roomId: m.room_id, peerId, peerNick, lastAt: m.created_at, lastText: snippet, incUnread });
      if (!knownDMs.has(m.room_id)) knownDMs.set(m.room_id, { peerNick, peerId });
      // если мы в этой комнате — сбросим непрочитанные
      if (m.room_id === currentRoomId) markDMRead(m.room_id);
    })
    .subscribe();
}
let currentRoomId = 'global';
let realtimeChannel = null;
let knownDMs = new Map(); // key: roomId, value: { peerNick, peerId }
let pollTimer = null;
let latestCreatedAt = null; // ISO timestamp of the newest message we know
let oldestCreatedAt = null; // ISO timestamp of the oldest message currently rendered
let hasMoreOlder = false;   // whether there may be older messages to load
let replyTarget = null; // { id, author, snippet }
const userCache = new Map(); // cache by userId -> {id, nick}
// Храним список последних ЛС в localStorage
let recentDMs = []; // [{ roomId, peerId, peerNick, lastAt, lastText, unread }]

function loadRecentDMs() {
  try {
    const raw = localStorage.getItem('recentDMs');
    recentDMs = raw ? JSON.parse(raw) : [];
  } catch { recentDMs = []; }
}

function saveRecentDMs() {
  try { localStorage.setItem('recentDMs', JSON.stringify(recentDMs)); } catch {}
}

function upsertRecentDM({ roomId, peerId, peerNick, lastAt, lastText, incUnread = 0 }) {
  if (!roomId || !peerId) return;
  const idx = recentDMs.findIndex(x => x.roomId === roomId);
  if (idx === -1) {
    recentDMs.unshift({ roomId, peerId, peerNick: peerNick || peerId.slice(0,8)+'…', lastAt: lastAt || null, lastText: (typeof lastText === 'string') ? lastText : '', unread: incUnread ? 1 : 0 });
  } else {
    const item = recentDMs[idx];
    item.peerNick = peerNick || item.peerNick;
    if (lastAt) item.lastAt = lastAt;
    if (typeof lastText === 'string') item.lastText = lastText;
    if (incUnread) item.unread = (item.unread || 0) + 1;
    // переместим вверх
    recentDMs.splice(idx, 1);
    recentDMs.unshift(item);
  }
  saveRecentDMs();
  renderDMList();
}

function markDMRead(roomId) {
  const idx = recentDMs.findIndex(x => x.roomId === roomId);
  if (idx !== -1) {
    recentDMs[idx].unread = 0;
    saveRecentDMs();
    renderDMList();
  }
}

function renderDMList() {
  if (!dmListEl) return;
  dmListEl.innerHTML = '';
  if (!recentDMs.length) {
    dmListEl.classList.add('empty-state');
    dmListEl.textContent = 'Начните поиск людей по нику';
    return;
  }
  dmListEl.classList.remove('empty-state');
  recentDMs.forEach(item => {
    const el = $('div', 'chat-item');
    el.dataset.roomId = item.roomId;
    const title = $('div', 'title', `ЛС: ${item.peerNick}`);
    const parts = [];
    if (item.lastText) parts.push(item.lastText.length > 40 ? item.lastText.slice(0,40)+'…' : item.lastText);
    if (item.lastAt) parts.push(new Date(item.lastAt).toLocaleTimeString());
    if (item.unread) parts.push(`+${item.unread}`);
    const subtitle = $('div', 'subtitle', parts.join(' • '));
    el.append(title, subtitle);
    el.addEventListener('click', () => { openDM({ id: item.peerId, nick: item.peerNick }); closeDrawerIfMobile(); });
    dmListEl.appendChild(el);
  });
}

// Генерация ника
const veggie = [
  'перец','огурчик','баклажан','помидор','морковка','редиска','кабачок','лук','чесночок','капуста','свёкла','тыква','брюква','картошка','зелень'
];
function randomNick() {
  const word = veggie[Math.floor(Math.random()*veggie.length)];
  const num = Math.floor(10 + Math.random()*990); // 2-3 цифры
  return `${word}${num}`;
}

// Утилиты
async function sha256(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function $(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function dmRoomId(userIdA, userIdB) {
  return ['dm', ...[userIdA, userIdB].sort()].join(':');
}

// Рендер сообщения
function renderMessage(msg, opts = { prepend: false, affectLatest: true }) {
  const isMe = msg.from_user === me.id;
  const wrap = $('div', `message${isMe ? ' me':''}`);
  wrap.dataset.msgId = msg.id;

  const meta = $('div', 'msg-meta');
  const time = new Date(msg.created_at);
  const authorSpan = $('span', 'author-link', msg.from_nick || (msg.from_user === me.id ? me.nick : (msg.from_user?.slice(0,8) + '…')));
  if (!isMe) {
    authorSpan.addEventListener('click', () => openDMByUserId(msg.from_user));
    authorSpan.title = 'Открыть ЛС';
  }
  const sep = document.createTextNode(' • ' + time.toLocaleString());
  meta.appendChild(authorSpan);
  meta.appendChild(sep);
  wrap.appendChild(meta);

  // Вставим блок с цитатой, если есть ответ
  if (msg.reply) {
    const rep = $('div', 'msg-reply');
    const auth = $('div', 'author', msg.reply.users?.nick || 'Сообщение');
    const snip = $('div', 'snippet');
    if (msg.reply.content) snip.textContent = msg.reply.content;
    else if (msg.reply.image_url) snip.textContent = '[Изображение]';
    else snip.textContent = '';
    rep.append(auth, snip);
    wrap.appendChild(rep);
  }

  if (msg.content) {
    const text = $('div', 'msg-text');
    text.textContent = msg.content;
    wrap.appendChild(text);
  }

  if (msg.image_url) {
    const imgWrap = $('div', 'msg-image');
    const img = new Image();
    img.src = msg.image_url;
    img.alt = 'изображение';
    img.addEventListener('click', () => openImage(msg.image_url));
    imgWrap.appendChild(img);
    wrap.appendChild(imgWrap);
  }

  if (opts.prepend) {
    const loadBar = document.getElementById('loadMoreBar');
    const anchor = loadBar ? loadBar.nextSibling : messagesEl.firstChild;
    messagesEl.insertBefore(wrap, anchor);
  } else {
    messagesEl.appendChild(wrap);
  }
  attachMessageHandlers(wrap, msg);
  // Обновим маркер последнего сообщения
  try {
    if (opts.affectLatest && msg.created_at) {
      if (!latestCreatedAt || new Date(msg.created_at) > new Date(latestCreatedAt)) latestCreatedAt = msg.created_at;
    }
  } catch {}
}

function attachMessageHandlers(el, msg) {
  const snippet = msg.content ? msg.content : (msg.image_url ? '[Изображение]' : '');
  const author = msg.from_nick || (msg.from_user === me.id ? me.nick : 'Пользователь');
  const setTarget = () => setReplyTarget({ id: msg.id, author, snippet });
  // ПК: правый клик по сообщению
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    setTarget();
  });
  // Телефон: долгое нажатие
  let pressTimer = null;
  el.addEventListener('touchstart', () => {
    pressTimer = setTimeout(setTarget, 500);
  });
  el.addEventListener('touchend', () => {
    if (pressTimer) clearTimeout(pressTimer);
  });
  el.addEventListener('touchmove', () => {
    if (pressTimer) clearTimeout(pressTimer);
  });
}

function setReplyTarget(target) {
  replyTarget = target;
  replyBar.classList.remove('hidden');
  replyAuthorEl.textContent = target.author;
  replyTextEl.textContent = target.snippet;
}
function clearReplyTarget() {
  replyTarget = null;
  replyBar.classList.add('hidden');
  replyAuthorEl.textContent = '';
  replyTextEl.textContent = '';
}
replyCancelBtn.addEventListener('click', clearReplyTarget);

function clearMessages() { messagesEl.innerHTML = ''; }

// Модалка изображения
function openImage(url) {
  modalImage.src = url;
  imageModal.classList.remove('hidden');
}
function closeImage() {
  imageModal.classList.add('hidden');
  modalImage.src = '';
}
modalBackdrop.addEventListener('click', closeImage);
modalClose.addEventListener('click', closeImage);

// Загрузка истории
async function loadMessages(roomId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, room_id, from_user, content, image_url, created_at, reply_to, users:from_user(nick), reply:reply_to(id, content, image_url, from_user, users:from_user(nick))')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return console.error('loadMessages:', error);
  clearMessages();
  ensureLoadMoreBar();
  // Показать в хронологическом порядке
  [...data].reverse().forEach(m => {
    renderMessage({
      id: m.id,
      room_id: m.room_id,
      from_user: m.from_user,
      content: m.content,
      image_url: m.image_url,
      created_at: m.created_at,
      from_nick: m.users?.nick,
      reply: m.reply || null
    }, { prepend: false, affectLatest: true });
  });
  // Установим latestCreatedAt
  if (data && data.length) {
    latestCreatedAt = data[0].created_at; // так как data по убыванию
    oldestCreatedAt = data[data.length - 1].created_at;
  } else {
    latestCreatedAt = null; oldestCreatedAt = null;
  }
  hasMoreOlder = (data && data.length === 50);
  updateLoadMoreBarVisibility();
  scrollToBottom();
}

// Подписка на realtime
function subscribeRoom(roomId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel(`room:${roomId}`)
    // Подписываемся на все INSERT в messages и фильтруем по room_id на клиенте,
    // так работает надёжнее, если на проекте не включены фильтры Realtime.
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      const m = payload.new;
      if (m.room_id !== currentRoomId) return; // показываем только текущую комнату
      let replyObj = null;
      if (m.reply_to) {
        fetchReply(m.reply_to)
          .then(rep => { if (rep) replyObj = rep; })
          .catch(() => {})
          .finally(() => {
            renderMessage({ ...m, from_nick: m.from_user === me.id ? me.nick : null, reply: replyObj }, { prepend: false, affectLatest: true });
            scrollToBottom();
          });
      } else {
        renderMessage({ ...m, from_nick: m.from_user === me.id ? me.nick : null, reply: replyObj }, { prepend: false, affectLatest: true });
        scrollToBottom();
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // ok
      }
    });
}

const replyCache = new Map();
async function fetchReply(id) {
  if (replyCache.has(id)) return replyCache.get(id);
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, image_url, from_user, users:from_user(nick)')
    .eq('id', id)
    .single();
  if (error) return null;
  const rep = { id: data.id, content: data.content, image_url: data.image_url, from_user: data.from_user, users: data.users };
  replyCache.set(id, rep);
  return rep;
}

// Пуллинг как резерв для realtime (каждые 3 секунды)
function startPolling(roomId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      if (!latestCreatedAt) return; // дождёмся первой загрузки
      const { data, error } = await supabase
    .from('messages')
    .select('id, room_id, from_user, content, image_url, created_at, reply_to, users:from_user(nick), reply:reply_to(id, content, image_url, from_user, users:from_user(nick))')
    .eq('room_id', roomId)
    .gt('created_at', latestCreatedAt)
    .order('created_at', { ascending: true })
    .limit(100);
      if (error) { console.warn('poll error:', error.message); return; }
      if (data && data.length) {
        data.forEach(m => renderMessage({
          id: m.id,
          room_id: m.room_id,
          from_user: m.from_user,
          content: m.content,
          image_url: m.image_url,
          created_at: m.created_at,
          from_nick: m.users?.nick,
          reply: m.reply || null
        }, { prepend: false, affectLatest: true }));
        scrollToBottom();
      }
    } catch (e) { console.warn('poll exception:', e); }
  }, 3000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Смена комнаты
async function switchRoom(roomId, title) {
  currentRoomId = roomId;
  roomTitleEl.textContent = title;
  await loadMessages(roomId);
  subscribeRoom(roomId);
  startPolling(roomId);
  if (roomId.startsWith('dm:')) markDMRead(roomId);
}

// Отправка текста
async function sendText() {
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = '';
  const payload = { room_id: currentRoomId, from_user: me.id, content: text };
  // Для DM можно сохранить to_user (не обязательно)
  const dm = knownDMs.get(currentRoomId);
  if (dm?.peerId) payload.to_user = dm.peerId;
  if (replyTarget?.id) payload.reply_to = replyTarget.id;
  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('id, room_id, from_user, content, image_url, created_at, reply_to')
    .single();
  if (error) {
    console.error('sendText:', error);
    return;
  }
  // Мгновенно отрисуем своё сообщение
  if (data) {
    let replyObj = null;
    if (data.reply_to && replyTarget) {
      replyObj = { id: replyTarget.id, content: replyTarget.snippet.startsWith('[') ? null : replyTarget.snippet, image_url: replyTarget.snippet === '[Изображение]' ? 'dummy' : null, users: { nick: replyTarget.author } };
    }
    renderMessage({ ...data, from_nick: me.nick, reply: replyObj });
    scrollToBottom();
    // Обновим список ЛС
    if (currentRoomId.startsWith('dm:')) {
      const peer = knownDMs.get(currentRoomId);
      if (peer) {
        upsertRecentDM({ roomId: currentRoomId, peerId: peer.peerId, peerNick: peer.peerNick, lastAt: data.created_at, lastText: text, incUnread: 0 });
      }
    }
  }
  clearReplyTarget();
}

// Отправка картинки
async function sendImage(file) {
  if (!file) return;
  // простая валидация
  const maxMB = 10;
  const okType = /^image\//.test(file.type);
  if (!okType) { alert('Можно отправлять только изображения'); return; }
  if (file.size > maxMB * 1024 * 1024) { alert(`Изображение слишком большое (> ${maxMB} МБ)`); return; }

  // UI: показать загрузку и заблокировать кнопки
  try {
    uploadBar.classList.remove('hidden');
    uploadText.textContent = 'Загрузка изображения…';
    attachBtn.disabled = true; sendBtn.disabled = true; messageInput.disabled = true;
  } catch {}
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${currentRoomId}/${crypto.randomUUID?.() || Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('chat-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg'
  });
  if (error) { 
    console.error('upload image:', error);
    alert(`Не удалось загрузить изображение. ${error.message || 'Проверьте настройки bucket и права.'}`);
    try { uploadText.textContent = 'Ошибка загрузки'; setTimeout(()=>uploadBar.classList.add('hidden'), 1200); } catch {}
    attachBtn.disabled = false; sendBtn.disabled = false; messageInput.disabled = false;
    return; 
  }
  const { data: pub } = supabase.storage.from('chat-images').getPublicUrl(path);
  const image_url = pub?.publicUrl;
  const dm = knownDMs.get(currentRoomId);
  const payload = { room_id: currentRoomId, from_user: me.id, image_url };
  if (dm?.peerId) payload.to_user = dm.peerId;
  if (replyTarget?.id) payload.reply_to = replyTarget.id;
  const { data: inserted, error: insErr } = await supabase
    .from('messages')
    .insert(payload)
    .select('id, room_id, from_user, content, image_url, created_at, reply_to')
    .single();
  if (insErr) {
    console.error('sendImage insert:', insErr);
    alert('Ошибка при отправке сообщения с изображением');
    try { uploadText.textContent = 'Ошибка отправки'; setTimeout(()=>uploadBar.classList.add('hidden'), 1200); } catch {}
    attachBtn.disabled = false; sendBtn.disabled = false; messageInput.disabled = false;
    return;
  }
  if (inserted) {
    let replyObj = null;
    if (inserted.reply_to && replyTarget) {
      replyObj = { id: replyTarget.id, content: replyTarget.snippet.startsWith('[') ? null : replyTarget.snippet, image_url: replyTarget.snippet === '[Изображение]' ? 'dummy' : null, users: { nick: replyTarget.author } };
    }
    renderMessage({ ...inserted, from_nick: me.nick, reply: replyObj });
    scrollToBottom();
    // Обновим список ЛС
    if (currentRoomId.startsWith('dm:')) {
      const peer = knownDMs.get(currentRoomId);
      if (peer) {
        upsertRecentDM({ roomId: currentRoomId, peerId: peer.peerId, peerNick: peer.peerNick, lastAt: inserted.created_at, lastText: '[Изображение]', incUnread: 0 });
      }
    }
  }
  clearReplyTarget();
  try { uploadText.textContent = 'Готово'; setTimeout(()=>uploadBar.classList.add('hidden'), 500); } catch {}
  attachBtn.disabled = false; sendBtn.disabled = false; messageInput.disabled = false;
}

// Поиск пользователей по нику
let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) { dmListEl.innerHTML = 'Начните поиск людей по нику'; return; }
  const { data, error } = await supabase
    .from('users')
    .select('id, nick')
    .ilike('nick', `%${q}%`)
    .limit(20);
  if (error) { console.error('search:', error); return; }
  dmListEl.innerHTML = '';
  if (!data.length) {
    dmListEl.textContent = 'Никого не найдено';
    return;
  }
  data.filter(u=>u.id!==me.id).forEach(u => {
    const roomId = dmRoomId(me.id, u.id);
    const item = $('div', 'chat-item');
    item.dataset.roomId = roomId;
    const title = $('div', 'title', `ЛС: ${u.nick}`);
    const sub = $('div', 'subtitle', 'Личное сообщение');
    item.append(title, sub);
    item.addEventListener('click', () => { openDM(u); closeDrawerIfMobile(); });
    dmListEl.appendChild(item);
  });
}

async function openDM(user) {
  const roomId = dmRoomId(me.id, user.id);
  knownDMs.set(roomId, { peerNick: user.nick, peerId: user.id });
  // Обновим список ЛС сразу, чтобы чат отобразился в сайдбаре
  // Не обновляем lastAt локальным временем, чтобы не «прыгало» время в списке
  upsertRecentDM({ roomId, peerId: user.id, peerNick: user.nick, lastText: '', incUnread: 0 });
  await switchRoom(roomId, `ЛС • ${user.nick}`);
  markDMRead(roomId);
  closeDrawerIfMobile();
}

async function getUserById(userId) {
  if (!userId) return null;
  if (userCache.has(userId)) return userCache.get(userId);
  const { data, error } = await supabase
    .from('users')
    .select('id, nick')
    .eq('id', userId)
    .single();
  if (error) { console.warn('getUserById:', error.message); return null; }
  userCache.set(userId, data);
  return data;
}

async function openDMByUserId(userId) {
  if (!userId || userId === me.id) return;
  const u = await getUserById(userId);
  if (u) await openDM(u);
}

// Клики
sendBtn.addEventListener('click', sendText);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
});
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    sendImage(fileInput.files[0]);
    fileInput.value = '';
  }
});

globalChatItem.addEventListener('click', () => { switchRoom('global', 'Общий чат'); closeDrawerIfMobile(); });

// Mobile drawer helpers
function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }
function openDrawer() {
  if (!sidebarEl) return;
  sidebarEl.classList.add('open');
  document.body.classList.add('sidebar-open');
}
function closeDrawer() {
  if (!sidebarEl) return;
  sidebarEl.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}
function toggleDrawer() { (sidebarEl?.classList.contains('open') ? closeDrawer : openDrawer)(); }
function closeDrawerIfMobile() { if (isMobile()) closeDrawer(); }
menuBtn?.addEventListener('click', toggleDrawer);

// ===== VisualViewport and Composer sizing =====
function setCSSVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

function updateVVH() {
  const vv = window.visualViewport;
  const h = vv ? Math.round(vv.height) : Math.round(window.innerHeight || document.documentElement.clientHeight);
  setCSSVar('--vvh', h + 'px');
}

let roComposer = null;
function observeComposerHeight() {
  if (!composerEl || typeof ResizeObserver === 'undefined') return;
  if (roComposer) { try { roComposer.disconnect(); } catch {}
  }
  roComposer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const box = entry.borderBoxSize?.[0] || entry.contentRect;
      const h = Math.ceil((box?.blockSize || box?.height || composerEl.offsetHeight) || 0);
      setCSSVar('--composer-h', h + 'px');
    }
  });
  roComposer.observe(composerEl);
  // initial
  setTimeout(() => setCSSVar('--composer-h', composerEl.offsetHeight + 'px'), 0);
}

function setupViewportVarHandlers() {
  updateVVH();
  observeComposerHeight();
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', updateVVH);
    vv.addEventListener('scroll', updateVVH); // address on-screen kb panning
  } else {
    window.addEventListener('resize', updateVVH);
  }
  window.addEventListener('orientationchange', () => setTimeout(updateVVH, 100));
}

// Авто-регистрация по IP (хэш)
async function ensureUser() {
  try {
    // Получаем публичный IP
    const resp = await fetch('https://api.ipify.org?format=json');
    const { ip } = await resp.json();
    const ip_hash = await sha256(ip);

    // Пробуем найти
    let { data: users, error } = await supabase.from('users').select('id, nick, ip_hash').eq('ip_hash', ip_hash).limit(1);
    if (error) throw error;
    if (users && users.length) {
      return users[0];
    }

    // Создаём с уникальным ником
    // Если такой ник занят — пробуем ещё раз
    for (let i=0;i<10;i++) {
      const nick = randomNick();
      const { data: ins, error: insErr } = await supabase.from('users').insert({ nick, ip_hash }).select('id, nick, ip_hash').single();
      if (!insErr && ins) return ins;
      if (insErr && !(`${insErr.message}`.includes('duplicate'))) console.warn('create user try fail:', insErr);
    }
    // Последняя попытка с timestamp
    const fallbackNick = `овощ${Date.now()%10000}`;
    const { data: ins2, error: insErr2 } = await supabase.from('users').insert({ nick: fallbackNick, ip_hash }).select('id, nick, ip_hash').single();
    if (insErr2) throw insErr2;
    return ins2;
  } catch (e) {
    console.error('ensureUser:', e);
    alert('Не удалось автоматически авторизоваться. Проверьте интернет.');
  }
}

// Запуск
(async function init() {
  if (!SUPABASE_URL || SUPABASE_URL.startsWith('YOUR_')) {
    alert('Укажите SUPABASE_URL и SUPABASE_ANON_KEY в script.js');
    return;
  }
  me = await ensureUser();
  if (!me) return;

  meNameEl.textContent = `Мой ник: ${me.nick}`;
  meIdEl.textContent = `ID: ${me.id.slice(0,8)}…`;

  // App-like ограничения: нет копирования/зумов/контекстного меню
  setupAppLikeGuards();
  // PWA и полноэкранный режим
  registerSW();
  setupFullscreenOnce();

  // Инициализация списка последних ЛС
  loadRecentDMs();
  renderDMList();
  subscribeDMWatch();

  // Старт: на десктопе — сразу общий чат; на мобиле — открываем меню, ждём выбора
  if (isMobile()) {
    openDrawer();
    roomTitleEl.textContent = 'Выберите чат';
  } else {
    await switchRoom('global', 'Общий чат');
  }

  // Настройка динамических переменных высоты для мобильных браузеров
  setupViewportVarHandlers();

  // По нажатию на кнопку меню — предложим установить PWA (если доступно)
  menuBtn.addEventListener('click', tryShowInstallPrompt, { once: true });
})();

// ===== Пагинация / Подгрузка старых сообщений =====
function ensureLoadMoreBar() {
  if (document.getElementById('loadMoreBar')) return;
  const bar = $('div', 'load-more-bar');
  bar.id = 'loadMoreBar';
  const btn = $('button', 'load-more-btn', 'Показать ещё 50');
  btn.addEventListener('click', () => loadOlder());
  bar.appendChild(btn);
  messagesEl.prepend(bar);
}

function updateLoadMoreBarVisibility() {
  const bar = document.getElementById('loadMoreBar');
  if (!bar) return;
  const nearTop = messagesEl.scrollTop <= 24;
  bar.style.display = hasMoreOlder && nearTop ? 'flex' : 'none';
}

messagesEl.addEventListener('scroll', () => {
  // Показ кнопки только у верхнего края
  updateLoadMoreBarVisibility();
});

async function loadOlder() {
  if (!oldestCreatedAt) return;
  try {
    const beforeHeight = messagesEl.scrollHeight;
    const { data, error } = await supabase
      .from('messages')
      .select('id, room_id, from_user, content, image_url, created_at, reply_to, users:from_user(nick), reply:reply_to(id, content, image_url, from_user, users:from_user(nick))')
      .eq('room_id', currentRoomId)
      .lt('created_at', oldestCreatedAt)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('loadOlder:', error); return; }
    if (!data || !data.length) { hasMoreOlder = false; updateLoadMoreBarVisibility(); return; }
    // Препендим в хронологическом порядке
    [...data].reverse().forEach(m => {
      renderMessage({
        id: m.id,
        room_id: m.room_id,
        from_user: m.from_user,
        content: m.content,
        image_url: m.image_url,
        created_at: m.created_at,
        from_nick: m.users?.nick,
        reply: m.reply || null
      }, { prepend: true, affectLatest: false });
    });
    oldestCreatedAt = data[data.length - 1].created_at;
    hasMoreOlder = data.length === 50;
    // Сохраним позицию скролла, чтобы контент не "прыгал"
    const afterHeight = messagesEl.scrollHeight;
    messagesEl.scrollTop = afterHeight - beforeHeight;
    updateLoadMoreBarVisibility();
  } catch (e) { console.warn('loadOlder exception:', e); }
}
