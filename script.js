/*
Настройка Supabase (минимально для запуска)
1) Вставьте ваши ключи ниже: SUPABASE_URL и SUPABASE_ANON_KEY
2) Создайте таблицы (SQL в Supabase -> SQL Editor) и хранилище:

-- Таблица пользователей
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  nick text not null unique,
  ip_hash text not null unique,
  avatar_url text,                -- ПУБЛИЧНАЯ ссылка на аватар в storage (можно null)
  bio text,                       -- краткое описание (можно null)
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
const roomStatusEl = document.getElementById('roomStatus');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const searchInput = document.getElementById('searchInput');
const dmListEl = document.getElementById('dmList');
const globalChatItem = document.getElementById('globalChatItem');
const composerEl = document.querySelector('.composer');
const chatListEl = document.querySelector('.chat-list');
// Profile UI
const meAvatarEl = document.getElementById('meAvatar');
const meAvatarPreviewEl = document.getElementById('meAvatarPreview');
const meBioTextarea = document.getElementById('meBio');
const meBioDisplay = document.getElementById('meBioDisplay');
const editProfileBtn = document.getElementById('editProfileBtn');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');
const profileEditor = document.getElementById('profileEditor');
const avatarInput = document.getElementById('avatarInput');
const avatarBrowseBtn = document.getElementById('avatarBrowseBtn');
const avatarStatus = document.getElementById('avatarStatus');
const meNickInput = document.getElementById('meNickInput');

// Profile Modal UI
const profileModal = document.getElementById('profileModal');
const profileBackdrop = document.getElementById('profileBackdrop');
const profileClose = document.getElementById('profileClose');
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileBio = document.getElementById('profileBio');
const profileMsgBtn = document.getElementById('profileMsgBtn');

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
// Settings UI
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');
const liteToggle = document.getElementById('liteToggle');
const bgUrlInput = document.getElementById('bgUrlInput');
const fontSizeRange = document.getElementById('fontSizeRange');
const applyAppearanceBtn = document.getElementById('applyAppearanceBtn');
const installPWABtn = document.getElementById('installPWABtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const resetLocalBtn = document.getElementById('resetLocalBtn');
const dimRange = document.getElementById('dimRange');
const compactToggle = document.getElementById('compactToggle');
const noAnimToggle = document.getElementById('noAnimToggle');
const exportSettingsBtn = document.getElementById('exportSettingsBtn');
const importSettingsBtn = document.getElementById('importSettingsBtn');
const importSettingsFile = document.getElementById('importSettingsFile');
const wipeAllBtn = document.getElementById('wipeAllBtn');

// Placeholder: Edge Function endpoint to wipe all data (must be implemented server-side with service role)
// Replace with your deployed function URL
const WIPE_ALL_ENDPOINT = 'https://YOUR-PROJECT.functions.supabase.co/wipe-all';

// (call UI removed)

// Loading overlay
const appLoader = document.getElementById('appLoader');
let appLoadStart = performance.now();
function showAppLoader() {
  try {
    document.body.classList.add('loading');
    appLoader?.classList.remove('hidden');
  } catch {}
}
async function hideAppLoader(minDurationMs = 600) {
  try {
    const elapsed = performance.now() - appLoadStart;
    const wait = Math.max(0, minDurationMs - elapsed);
    if (wait) await new Promise(r => setTimeout(r, wait));
    appLoader?.classList.add('hidden');
    document.body.classList.remove('loading');
  } catch {}
}
// show immediately on script load
showAppLoader();

// Performance: enable lightweight mode on mobile/low-power devices
(function enableLiteModeIfNeeded() {
  try {
    const override = localStorage.getItem('lite');
    if (override === '1') { document.body?.classList?.add('lite'); return; }
    if (override === '0') { document.body?.classList?.remove('lite'); return; }
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua);
    const lowMem = (navigator.deviceMemory || 8) <= 4; // <=4GB
    const lowCPU = (navigator.hardwareConcurrency || 8) <= 4; // <=4 cores
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isMobile || lowMem || lowCPU || reducedMotion) {
      document.body?.classList?.add('lite');
    }
  } catch {}
})();

// Hint browsers to lazy-load static images
try {
  meAvatarEl?.setAttribute('loading', 'lazy');
  meAvatarPreviewEl?.setAttribute('loading', 'lazy');
  profileAvatar?.setAttribute('loading', 'lazy');
  modalImage?.setAttribute('loading', 'lazy');
  // give browsers more hints
  meAvatarEl?.setAttribute('decoding', 'async');
  meAvatarPreviewEl?.setAttribute('decoding', 'async');
  profileAvatar?.setAttribute('decoding', 'async');
  modalImage?.setAttribute('decoding', 'async');
  meAvatarEl?.setAttribute('fetchpriority', 'low');
  profileAvatar?.setAttribute('fetchpriority', 'low');
} catch {}

// (webrtc helpers removed)

// Состояние
let me = null; // { id, nick, ip_hash }
let deferredInstallPrompt = null; // для PWA «добавить на экран»
let myProfile = { avatar_url: '', bio: '' };
let currentProfileUser = null; // { id, nick }

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

// ===== Полноэкранная "блокировка" и перехват кнопки Назад на мобильных =====
let fsLockEnabled = false;
function requestFullscreenIfPossible() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    try { el.requestFullscreen(); } catch {}
  }
}

function setupFullscreenLock() {
  if (!isMobile()) return;
  fsLockEnabled = true;
  // Подстрахуемся: при любом взаимодействии пытаемся войти в фуллскрин, если вышли
  const tryReenter = () => { if (fsLockEnabled) requestFullscreenIfPossible(); };
  document.addEventListener('fullscreenchange', () => {
    if (fsLockEnabled && !document.fullscreenElement) {
      // Попробуем сразу вернуть полноэкранный режим
      requestFullscreenIfPossible();
    }
  });
  document.addEventListener('click', tryReenter, true);
  document.addEventListener('touchend', tryReenter, true);
  window.addEventListener('focus', tryReenter);
}

function setupBackTrap() {
  if (!isMobile()) return;
  try {
    // Делаем «петлю» в истории, чтобы аппаратная кнопка Назад не закрывала сайт
    history.replaceState({ locked: true }, document.title);
    history.pushState({ locked: true }, document.title);
    window.addEventListener('popstate', (e) => {
      // Сразу возвращаем состояние, остаёмся на странице
      if (e.state && e.state.locked) {
        history.pushState({ locked: true }, document.title);
      }
    });
  } catch {}
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
let isSwitchingRoom = false; // guard against double click animations

// (WebRTC state removed)

// ===== IndexedDB cache (~2GB soft limit) =====
const IDB_NAME = 'chatCache';
const IDB_VER = 1;
let idbPromise = null;
function idbOpen() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('by_room_created', ['room_id', 'created_at'], { unique: false });
        store.createIndex('by_created', 'created_at', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function idbAddMessages(msgs) {
  if (!msgs || !msgs.length) return;
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      for (const m of msgs) {
        try { store.put(m); } catch {}
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    // prune asynchronously, not blocking UI
    idbPruneIfNeeded().catch(()=>{});
  } catch {}
}

async function idbGetRecentMessages(roomId, limit = 200) {
  if (!roomId) return [];
  try {
    const db = await idbOpen();
    return await new Promise((res, rej) => {
      const tx = db.transaction('messages', 'readonly');
      const idx = tx.objectStore('messages').index('by_room_created');
      const range = IDBKeyRange.bound([roomId, ''], [roomId, '\uffff']);
      const out = [];
      idx.openCursor(range, 'prev').onsuccess = (e) => {
        const cur = e.target.result;
        if (!cur || out.length >= limit) { res(out); return; }
        out.push(cur.value);
        cur.continue();
      };
      tx.onerror = () => rej(tx.error);
    });
  } catch { return []; }
}

async function idbPruneIfNeeded() {
  try {
    if (!('storage' in navigator) || !navigator.storage.estimate) return;
    const est = await navigator.storage.estimate();
    const used = est.usage || 0;
    const quota = est.quota || (2 * 1024 * 1024 * 1024);
    const limit = Math.min(quota * 0.95, 2 * 1024 * 1024 * 1024); // ~2GB soft cap
    if (used < limit) return;
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction('messages', 'readwrite');
      const idx = tx.objectStore('messages').index('by_created');
      const toDelete = [];
      idx.openCursor().onsuccess = (e) => {
        const cur = e.target.result;
        if (!cur) return; // keep going until done; we'll delete as we go
        toDelete.push(cur.primaryKey);
        cur.delete();
        // Stop early if we have cleared enough (best-effort)
        if (toDelete.length >= 5000) { res(); tx.abort?.(); return; }
        cur.continue();
      };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {}
}

function loadRecentDMs() {
  try {
    const raw = localStorage.getItem('recentDMs');
    const arr = raw ? JSON.parse(raw) : [];
    // Deduplicate by roomId and keep the newest lastAt; merge unread counters
    const map = new Map();
    for (const item of Array.isArray(arr) ? arr : []) {
      if (!item || !item.roomId) continue;
      const prev = map.get(item.roomId);
      if (!prev) {
        map.set(item.roomId, { ...item, unread: item.unread || 0 });
      } else {
        const newer = (prev.lastAt && item.lastAt) ? (new Date(item.lastAt) > new Date(prev.lastAt) ? item : prev) : (item.lastAt ? item : prev);
        map.set(item.roomId, {
          ...newer,
          // merge best nick and text
          peerNick: newer.peerNick || prev.peerNick || item.peerNick,
          lastText: typeof newer.lastText === 'string' ? newer.lastText : (typeof prev.lastText === 'string' ? prev.lastText : ''),
          unread: (prev.unread || 0) + (item.unread || 0)
        });
      }
    }
    // Sort by lastAt desc, fall back to insertion order
    recentDMs = Array.from(map.values()).sort((a, b) => {
      const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
      const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
      return tb - ta;
    });
    // Cap list to 100 items to avoid growth
    if (recentDMs.length > 100) recentDMs.length = 100;
    // Persist back normalized structure to avoid future dups
    saveRecentDMs();
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
    if (recentDMs[idx].unread !== 0) {
      recentDMs[idx].unread = 0;
      saveRecentDMs();
      renderDMList();
    }
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
    // leading avatar
    const leading = $('div', 'leading');
    const av = new Image();
    av.className = 'avatar md';
    av.alt = 'avatar';
    av.src = getAvatarUrlFor(item.peerId, item.peerNick);
    leading.appendChild(av);
    // async resolve avatar from DB (если есть)
    getUserById(item.peerId).then(u => {
      if (u?.avatar_url) av.src = u.avatar_url;
    }).catch(()=>{});

    const textWrap = $('div', 'text');
    const title = $('div', 'title', `ЛС: ${item.peerNick}`);
    title.style.cursor = 'pointer';
    title.title = 'Открыть профиль';
    title.addEventListener('click', (e) => { e.stopPropagation(); openProfileByUserId(item.peerId); });
    const parts = [];
    if (item.lastText) parts.push(item.lastText.length > 40 ? item.lastText.slice(0,40)+'…' : item.lastText);
    if (item.lastAt) parts.push(new Date(item.lastAt).toLocaleTimeString());
    if (item.unread) parts.push(`+${item.unread}`);
    const subtitle = $('div', 'subtitle', parts.join(' • '));
    textWrap.append(title, subtitle);
    el.append(leading, textWrap);
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

function placeholderAvatar(nickOrId, size = 64) {
  const seed = encodeURIComponent(nickOrId || 'user');
  // DiceBear initials (SVG) renders fine in <img src>
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&radius=50&backgroundType=gradientLinear&fontSize=38&size=${size}`;
}

function loadMyProfile() {
  try {
    const raw = localStorage.getItem('myProfile');
    myProfile = raw ? JSON.parse(raw) : { avatar_url: '', bio: '' };
  } catch { myProfile = { avatar_url: '', bio: '' }; }
}

function saveMyProfile() {
  try { localStorage.setItem('myProfile', JSON.stringify(myProfile)); } catch {}
}

function getAvatarUrlFor(userId, nick) {
  // Self: ALWAYS use DB value (me.avatar_url) for rendering, not local storage
  if (me && userId === me.id) {
    const selfDbUrl = me.avatar_url || '';
    return selfDbUrl || placeholderAvatar(me.nick, 64);
  }
  // Others: prefer cached DB avatar, fallback to placeholder
  const cached = userCache.get(userId);
  if (cached && cached.avatar_url) return cached.avatar_url;
  return placeholderAvatar(nick || userId, 64);
}

function openProfile(user) {
  if (!user || !profileModal) return;
  currentProfileUser = user; // { id, nick }
  const isSelf = me && user.id === me.id;
  profileAvatar.src = getAvatarUrlFor(user.id, user.nick);
  profileName.textContent = user.nick || (user.id?.slice(0,8)+'…');
  if (isSelf) {
    profileBio.textContent = myProfile.bio || 'Без описания';
  } else {
    const cached = userCache.get(user.id);
    profileBio.textContent = (user.bio || cached?.bio || 'Нет описания');
    // try to resolve async
    if (!user.bio) {
      getUserById(user.id).then(u => {
        if (u?.bio) profileBio.textContent = u.bio;
        if (u?.avatar_url) profileAvatar.src = u.avatar_url;
      }).catch(()=>{});
    }
  }
  profileModal.classList.remove('hidden');
}

function openProfileByUserId(userId) {
  if (!userId) return;
  if (me && userId === me.id) { openProfile({ id: me.id, nick: me.nick }); return; }
  getUserById(userId).then(u => { if (u) openProfile(u); });
}

function closeProfile() {
  profileModal?.classList.add('hidden');
  currentProfileUser = null;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function dmRoomId(userIdA, userIdB) {
  return ['dm', ...[userIdA, userIdB].sort()].join(':');
}

// Рендер сообщения
function renderMessage(msg, opts = { prepend: false, affectLatest: true }) {
  // Deduplicate: if a message with the same id is already in DOM, skip rendering
  if (msg.id) {
    const exists = messagesEl.querySelector(`[data-msg-id="${msg.id}"]`);
    if (exists) return;
  }
  const isMe = msg.from_user === me.id;
  const wrap = $('div', `message${isMe ? ' me':''}`);
  wrap.dataset.msgId = msg.id;

  const meta = $('div', 'msg-meta');
  const time = new Date(msg.created_at);
  const authorName = msg.from_nick || (msg.from_user === me.id ? me.nick : (msg.from_user?.slice(0,8) + '…'));
  const authorAvatar = new Image();
  authorAvatar.className = 'author-avatar';
  authorAvatar.alt = 'avatar';
  authorAvatar.src = getAvatarUrlFor(msg.from_user, authorName);
  authorAvatar.style.cursor = 'pointer';
  authorAvatar.addEventListener('click', () => openProfileByUserId(msg.from_user));
  meta.appendChild(authorAvatar);
  // async resolve author avatar
  getUserById(msg.from_user).then(u => { if (u?.avatar_url) authorAvatar.src = u.avatar_url; }).catch(()=>{});
  const authorSpan = $('span', 'author-link', authorName);
  authorSpan.addEventListener('click', () => openProfileByUserId(msg.from_user));
  authorSpan.title = 'Открыть профиль';
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
  // 1) Render from cache instantly (best-effort)
  try {
    const cached = await idbGetRecentMessages(roomId, 200);
    if (cached && cached.length) {
      clearMessages();
      ensureLoadMoreBar();
      [...cached].reverse().forEach(m => renderMessage(m, { prepend: false, affectLatest: true }));
      latestCreatedAt = cached[0]?.created_at || null;
      oldestCreatedAt = cached[cached.length - 1]?.created_at || null;
      hasMoreOlder = cached.length >= 50;
      updateLoadMoreBarVisibility();
      scrollToBottom();
    } else {
      clearMessages();
      ensureLoadMoreBar();
    }
  } catch {}

  // 2) Network fetch to refresh
  const { data, error } = await supabase
    .from('messages')
    .select('id, room_id, from_user, content, image_url, created_at, reply_to, users:from_user(nick), reply:reply_to(id, content, image_url, from_user, users:from_user(nick))')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return console.error('loadMessages:', error);
  // If we already rendered from cache above, we won't clear; dedupe is handled by renderMessage
  if (!messagesEl.firstChild) {
    clearMessages();
    ensureLoadMoreBar();
  }
  // Показать в хронологическом порядке
  [...data].reverse().forEach(m => {
    const msg = {
      id: m.id,
      room_id: m.room_id,
      from_user: m.from_user,
      content: m.content,
      image_url: m.image_url,
      created_at: m.created_at,
      from_nick: m.users?.nick,
      reply: m.reply || null
    };
    renderMessage(msg, { prepend: false, affectLatest: true });
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
  // 3) Save to cache
  try {
    await idbAddMessages(data.map(m => ({
      id: m.id,
      room_id: m.room_id,
      from_user: m.from_user,
      content: m.content,
      image_url: m.image_url,
      created_at: m.created_at,
      from_nick: m.users?.nick,
      reply: m.reply || null
    })));
  } catch {}
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
            const msg = { ...m, from_nick: m.from_user === me.id ? me.nick : null, reply: replyObj };
            renderMessage(msg, { prepend: false, affectLatest: true });
            idbAddMessages([msg]).catch(()=>{});
            scrollToBottom();
          });
      } else {
        const msg = { ...m, from_nick: m.from_user === me.id ? me.nick : null, reply: replyObj };
        renderMessage(msg, { prepend: false, affectLatest: true });
        idbAddMessages([msg]).catch(()=>{});
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
        const msgs = data.map(m => ({
          id: m.id,
          room_id: m.room_id,
          from_user: m.from_user,
          content: m.content,
          image_url: m.image_url,
          created_at: m.created_at,
          from_nick: m.users?.nick,
          reply: m.reply || null
        }));
        msgs.forEach(m => renderMessage(m, { prepend: false, affectLatest: true }));
        idbAddMessages(msgs).catch(()=>{});
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
    .select('id, nick, avatar_url')
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
    const leading = $('div', 'leading');
    const av = new Image(); av.className = 'avatar md'; av.alt = 'avatar'; av.src = getAvatarUrlFor(u.id, u.nick);
    leading.appendChild(av);
    // async resolve
    getUserById(u.id).then(full => { if (full?.avatar_url) av.src = full.avatar_url; }).catch(()=>{});
    const textWrap = $('div', 'text');
    const title = $('div', 'title', `ЛС: ${u.nick}`);
    title.style.cursor = 'pointer';
    title.title = 'Открыть профиль';
    title.addEventListener('click', (e) => { e.stopPropagation(); openProfile(u); });
    const sub = $('div', 'subtitle', 'Личное сообщение');
    textWrap.append(title, sub);
    item.append(leading, textWrap);
    item.addEventListener('click', () => { openDM(u); closeDrawerIfMobile(); });
    dmListEl.appendChild(item);
  });
}

function presenceTextFrom(ts) {
  if (!ts) return '';
  try {
    const t = new Date(ts).getTime();
    const now = Date.now();
    const online = (now - t) <= 60_000; // 60s threshold
    if (online) return 'В сети';
    const d = new Date(ts);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString();
    return `Был(а) в сети: ${time} · ${date}`;
  } catch { return ''; }
}

function updateRoomStatusForDM(peer) {
  if (!roomStatusEl) return;
  if (!peer) { roomStatusEl.textContent = ''; return; }
  // Try cached first
  const cached = userCache.get(peer.id || peer.peerId);
  if (cached && cached.last_seen) {
    roomStatusEl.textContent = presenceTextFrom(cached.last_seen);
  } else {
    roomStatusEl.textContent = '';
  }
  // Refresh from DB
  getUserById(peer.id || peer.peerId).then(u => {
    if (u && (u.last_seen || u.updated_at)) {
      roomStatusEl.textContent = presenceTextFrom(u.last_seen || u.updated_at);
    }
  }).catch(()=>{});
}

function updateRoomStatus() {
  try {
    if (!roomStatusEl) return;
    if (currentRoomId && currentRoomId.startsWith('dm:')) {
      const peer = knownDMs.get(currentRoomId);
      if (peer) updateRoomStatusForDM({ id: peer.peerId }); else roomStatusEl.textContent = '';
    } else {
      // For global: show our own presence
      if (me?.last_seen) roomStatusEl.textContent = `Ваш статус: ${presenceTextFrom(me.last_seen)}`;
      else roomStatusEl.textContent = '';
    }
  } catch {}
}

let heartbeatTimer = null;
async function heartbeat() {
  try {
    if (!me?.id) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('users').update({ last_seen: nowIso }).eq('id', me.id);
    if (!error) { me.last_seen = nowIso; userCache.set(me.id, { ...(userCache.get(me.id)||{}), id: me.id, nick: me.nick, avatar_url: me.avatar_url || null, bio: me.bio || null, last_seen: nowIso }); }
  } catch {}
  updateRoomStatus();
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 30000);
}
function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }

async function openDM(user) {
  if (isSwitchingRoom) return;
  isSwitchingRoom = true;
  // Suppress list animations while we switch rooms and DM list re-renders
  try { chatListEl?.classList.add('no-anim'); } catch {}
  const roomId = dmRoomId(me.id, user.id);
  knownDMs.set(roomId, { peerNick: user.nick, peerId: user.id });
  // Добавим в список ЛС, только если его там ещё нет —
  // чтобы не триггерить лишний re-render и «двойную» анимацию при клике
  if (!recentDMs.some(x => x.roomId === roomId)) {
    // Не обновляем lastAt локальным временем, чтобы не «прыгало» время в списке
    upsertRecentDM({ roomId, peerId: user.id, peerNick: user.nick, lastText: '', incUnread: 0 });
  }
  // Сразу сбросим непрочитанные, чтобы возможный re-render списка случился уже под "no-anim"
  markDMRead(roomId);
  try {
    await switchRoom(roomId, `ЛС • ${user.nick}`);
    updateRoomStatus();
    closeDrawerIfMobile();
  } finally {
    isSwitchingRoom = false;
    // Allow animations again after the DOM settles
    setTimeout(() => { try { chatListEl?.classList.remove('no-anim'); } catch {} }, 300);
  }
}

async function getUserById(userId) {
  if (!userId) return null;
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, nick, avatar_url, bio, last_seen')
      .eq('id', userId)
      .single();
    if (error) throw error;
    userCache.set(userId, data);
    return data;
  } catch (e) {
    // Fallback if columns missing
    const { data: data2, error: err2 } = await supabase
      .from('users')
      .select('id, nick, last_seen')
      .eq('id', userId)
      .single();
    if (err2) { console.warn('getUserById:', err2.message); return null; }
    const normalized = { ...data2, avatar_url: null, bio: null };
    userCache.set(userId, normalized);
    return normalized;
  }
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

function applySavedAppearance() {
  try {
    const bg = localStorage.getItem('bgUrl');
    if (bg) document.documentElement.style.setProperty('--chat-bg', `url('${bg}')`);
  } catch {}
  try {
    const fs = parseInt(localStorage.getItem('msgFontSize') || '14', 10);
    if (!isNaN(fs)) setCSSVar('--msg-font-size', fs + 'px');
  } catch {}
  try {
    const dim = parseFloat(localStorage.getItem('bgDim') || '0.6');
    const v = isNaN(dim) ? 0.6 : Math.min(0.95, Math.max(0, dim));
    setCSSVar('--chat-bg-dim', `rgba(0,0,0,${v})`);
  } catch {}
  try {
    const compact = localStorage.getItem('compact') === '1';
    const noanim = localStorage.getItem('noanim') === '1';
    document.body.classList.toggle('compact', compact);
    document.body.classList.toggle('no-anim', noanim);
  } catch {}
}

function openSettings() { settingsModal?.classList.remove('hidden'); syncSettingsForm(); }
function closeSettings() { settingsModal?.classList.add('hidden'); }

function syncSettingsForm() {
  try {
    const lite = localStorage.getItem('lite');
    liteToggle.checked = lite === '1' || document.body.classList.contains('lite');
  } catch { liteToggle.checked = document.body.classList.contains('lite'); }
  try { bgUrlInput.value = localStorage.getItem('bgUrl') || ''; } catch { bgUrlInput.value = ''; }
  try { fontSizeRange.value = localStorage.getItem('msgFontSize') || '14'; } catch { fontSizeRange.value = '14'; }
  try { dimRange.value = localStorage.getItem('bgDim') || '0.6'; } catch { dimRange.value = '0.6'; }
  try { compactToggle.checked = localStorage.getItem('compact') === '1'; } catch { compactToggle.checked = false; }
  try { noAnimToggle.checked = localStorage.getItem('noanim') === '1'; } catch { noAnimToggle.checked = false; }
}

function applyAppearance() {
  const bg = (bgUrlInput?.value || '').trim();
  const size = parseInt(fontSizeRange?.value || '14', 10);
  const dim = parseFloat(dimRange?.value || '0.6');
  if (bg) {
    document.documentElement.style.setProperty('--chat-bg', `url('${bg}')`);
    try { localStorage.setItem('bgUrl', bg); } catch {}
  }
  if (!isNaN(size)) {
    setCSSVar('--msg-font-size', size + 'px');
    try { localStorage.setItem('msgFontSize', String(size)); } catch {}
  }
  if (!isNaN(dim)) {
    setCSSVar('--chat-bg-dim', `rgba(0,0,0,${dim})`);
    try { localStorage.setItem('bgDim', String(dim)); } catch {}
  }
}

function isFullscreen() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
}

function toggleFullscreen() {
  try {
    if (!isFullscreen()) {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document);
    }
  } catch {}
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

// Авто-регистрация по локальному стабильному идентификатору устройства (hash)
async function ensureUser() {
  try {
    // 1) Пытаемся восстановить пользователя по сохранённому ID (устойчивее, чем IP)
    try {
      const savedId = localStorage.getItem('userId');
      if (savedId) {
        const u = await getUserById(savedId);
        if (u && u.id) return u;
      }
    } catch {}

    // 2) Если нет сохранённого ID, используем стабильный deviceId, сгенерированный локально
    //    Это не требует внешних запросов (работает с жёстким CSP и оффлайн), и лучше для приватности
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      deviceId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('deviceId', deviceId); } catch {}
    }
    const ip_hash = await sha256(deviceId); // используем то же поле ip_hash как "устройство"

    // Пробуем найти
    // Try extended fields; if the table doesn't have them yet, fall back gracefully
    let users = null;
    try {
      const resp = await supabase.from('users').select('id, nick, ip_hash, avatar_url, bio').eq('ip_hash', ip_hash).limit(1);
      if (resp.error) throw resp.error;
      users = resp.data;
    } catch {
      const resp2 = await supabase.from('users').select('id, nick, ip_hash').eq('ip_hash', ip_hash).limit(1);
      if (resp2.error) throw resp2.error;
      users = resp2.data?.map(u => ({ ...u, avatar_url: null, bio: null })) || [];
    }
    if (users && users.length) {
      return users[0];
    }

    // 3) Создаём с уникальным ником
    // Если такой ник занят — пробуем ещё раз
    for (let i=0;i<10;i++) {
      const nick = randomNick();
      let ins = null; let insErr = null;
      try {
        const r = await supabase.from('users').insert({ nick, ip_hash }).select('id, nick, ip_hash, avatar_url, bio').single();
        ins = r.data; insErr = r.error || null;
      } catch (e) { insErr = e; }
      if (insErr) {
        // Retry with minimal select (no extra columns)
        const r2 = await supabase.from('users').insert({ nick, ip_hash }).select('id, nick, ip_hash').single();
        ins = r2.data; insErr = r2.error || null;
      }
      if (!insErr && ins) return ins;
      if (insErr && !(`${insErr.message}`.includes('duplicate'))) console.warn('create user try fail:', insErr);
    }
    // Последняя попытка с timestamp
    const fallbackNick = `овощ${Date.now()%10000}`;
    let ins2 = null; let insErr2 = null;
    try {
      const r3 = await supabase.from('users').insert({ nick: fallbackNick, ip_hash }).select('id, nick, ip_hash, avatar_url, bio').single();
      ins2 = r3.data; insErr2 = r3.error || null;
    } catch (e) { insErr2 = e; }
    if (insErr2) {
      const r4 = await supabase.from('users').insert({ nick: fallbackNick, ip_hash }).select('id, nick, ip_hash').single();
      if (r4.error) throw r4.error;
      return r4.data;
    }
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
  // Сохраняем стабильный ID пользователя, чтобы не плодились новые строки в users
  try { localStorage.setItem('userId', me.id); } catch {}

  meNameEl.textContent = `Мой ник: ${me.nick}`;
  meIdEl.textContent = `ID: ${me.id.slice(0,8)}…`;
  // Profile load and UI init (DB is the source of truth)
  loadMyProfile();
  // Refresh self from DB to get the latest avatar/bio/last_seen
  try {
    const fresh = await getUserById(me.id);
    if (fresh) me = { ...me, ...fresh };
  } catch {}
  // Overwrite local profile from DB so UI shows DB data
  myProfile.avatar_url = me.avatar_url || '';
  myProfile.bio = me.bio || '';
  saveMyProfile();
  const myAvatarUrl = me.avatar_url || placeholderAvatar(me.nick, 64);
  if (meAvatarEl) meAvatarEl.src = myAvatarUrl;
  if (meAvatarPreviewEl) meAvatarPreviewEl.src = myAvatarUrl;
  if (meBioDisplay) meBioDisplay.textContent = me.bio || '';
  if (meBioTextarea) meBioTextarea.value = me.bio || '';
  // Open own profile on clicking name/avatar
  meNameEl?.addEventListener('click', () => openProfile({ id: me.id, nick: me.nick }));
  meAvatarEl?.addEventListener('click', () => openProfile({ id: me.id, nick: me.nick }));
  // Editor toggles
  editProfileBtn?.addEventListener('click', () => {
    profileEditor?.classList.toggle('hidden');
    // sync fields each open
    if (!profileEditor?.classList.contains('hidden')) {
      if (meNickInput) meNickInput.value = me.nick || '';
      meAvatarPreviewEl.src = (myProfile.avatar_url || placeholderAvatar(me.nick, 64));
      meBioTextarea.value = myProfile.bio || '';
      // reset file input and status each time editor opens
      if (avatarInput) avatarInput.value = '';
      if (avatarStatus) avatarStatus.textContent = myProfile.avatar_url ? 'Загружено' : 'Не выбрано';
    }
  });
  cancelProfileBtn?.addEventListener('click', () => {
    profileEditor?.classList.add('hidden');
    if (avatarInput) avatarInput.value = '';
    if (avatarStatus) avatarStatus.textContent = myProfile.avatar_url ? 'Загружено' : 'Не выбрано';
  });
  // Custom browse button for avatar
  avatarBrowseBtn?.addEventListener('click', () => avatarInput?.click());
  avatarInput?.addEventListener('change', () => {
    const f = avatarInput.files?.[0];
    if (f) {
      // preview selected file without showing filename
      const url = URL.createObjectURL(f);
      meAvatarPreviewEl.src = url;
      // Mark status
      if (avatarStatus) avatarStatus.textContent = 'Файл выбран';
      // Revoke after image loads to free memory
      meAvatarPreviewEl.onload = () => { try { URL.revokeObjectURL(url); } catch {} };
    } else {
      meAvatarPreviewEl.src = (myProfile.avatar_url || placeholderAvatar(me.nick, 64));
      if (avatarStatus) avatarStatus.textContent = myProfile.avatar_url ? 'Загружено' : 'Не выбрано';
    }
  });
  saveProfileBtn?.addEventListener('click', async () => {
    // Handle avatar upload if any
    let newAvatarUrl = myProfile.avatar_url;
    try {
      const f = avatarInput?.files?.[0];
      if (f) {
        const okType = /^image\//.test(f.type);
        if (!okType) { alert('Только изображения для аватара'); return; }
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `avatars/${me.id}.${ext}`;
        // upsert: true to overwrite
        const { error: upErr } = await supabase.storage.from('chat-images').upload(path, f, { upsert: true, cacheControl: '3600', contentType: f.type || 'image/jpeg' });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('chat-images').getPublicUrl(path);
        newAvatarUrl = pub?.publicUrl || '';
      }
    } catch (e) {
      console.warn('avatar upload:', e);
      alert('Не удалось загрузить аватар. Проверьте bucket chat-images.');
    }
    const newBio = (meBioTextarea?.value || '').trim();
    // Prepare nick update (validate and check diff)
    let newNick = (meNickInput?.value || '').trim();
    if (!newNick) newNick = me.nick; // keep old if empty
    if (newNick.length > 24) newNick = newNick.slice(0,24);

    myProfile = { avatar_url: newAvatarUrl || myProfile.avatar_url, bio: newBio };
    saveMyProfile();
    // Persist to Supabase users so другие увидят ваш аватар/био/ник
    try {
      let updates = { avatar_url: myProfile.avatar_url || null, bio: myProfile.bio || null };
      // If nick changed, attempt update with collision handling
      const nickChanged = newNick && newNick !== me.nick;
      if (nickChanged) updates.nick = newNick;
      // Try full update first
      let { error: upUserErr } = await supabase.from('users').update(updates).eq('id', me.id);
      // If schema doesn't have avatar_url/bio yet, retry without those keys
      if (upUserErr && /column\s+"?avatar_url"?|column\s+"?bio"?/i.test(upUserErr.message || '')) {
        const reduced = { ...updates };
        delete reduced.avatar_url;
        delete reduced.bio;
        const retry = await supabase.from('users').update(reduced).eq('id', me.id);
        upUserErr = retry.error || null;
      }
      if (upUserErr) {
        console.warn('update users avatar/bio/nick:', upUserErr.message);
        if (/duplicate|unique/i.test(upUserErr.message || '')) {
          // handled below in nickChanged block
        } else {
          alert(`Не удалось сохранить профиль в базе. Проверьте права UPDATE/схему таблицы users.\n\nОшибка: ${upUserErr.message || upUserErr.code || 'unknown'}`);
        }
      }
      // Refresh local me and cache
      if (nickChanged && upUserErr && /duplicate|unique/i.test(upUserErr.message || '')) {
        alert('Такой ник уже занят. Выберите другой.');
      } else {
        // If update succeeded, reflect new nick locally
        if (!upUserErr && nickChanged) me.nick = newNick;
        me = { ...me, avatar_url: updates.avatar_url ?? me.avatar_url, bio: updates.bio ?? me.bio };
      }
      userCache.set(me.id, { id: me.id, nick: me.nick, avatar_url: me.avatar_url || myProfile.avatar_url || '', bio: myProfile.bio || '' });
    } catch (e) { console.warn('users update exception:', e); alert('Ошибка сохранения профиля. Подробности в консоли.'); }
    // Update UI
    const finalUrl = myProfile.avatar_url || placeholderAvatar(me.nick, 64);
    if (meAvatarEl) meAvatarEl.src = finalUrl;
    if (meAvatarPreviewEl) meAvatarPreviewEl.src = finalUrl;
    if (meBioDisplay) meBioDisplay.textContent = myProfile.bio || '';
    if (meNameEl) meNameEl.textContent = `Мой ник: ${me.nick}`;
    if (avatarStatus) avatarStatus.textContent = myProfile.avatar_url ? 'Загружено' : 'Не выбрано';
    profileEditor?.classList.add('hidden');
  });

  // Profile modal controls
  profileBackdrop?.addEventListener('click', closeProfile);
  profileClose?.addEventListener('click', closeProfile);
  profileMsgBtn?.addEventListener('click', () => {
    if (!currentProfileUser) return;
    openDM(currentProfileUser);
    closeProfile();
  });

  // App-like ограничения: нет копирования/зумов/контекстного меню
  setupAppLikeGuards();
  // PWA и полноэкранный режим
  registerSW();
  setupFullscreenOnce();
  // Усиленная фиксация полноэкранного режима и перехват Назад на мобильных
  setupFullscreenLock();
  setupBackTrap();

  // Apply saved appearance early
  applySavedAppearance();

  // Инициализация списка последних ЛС
  loadRecentDMs();
  renderDMList();
  subscribeDMWatch();

  // Presence heartbeat and status updates
  startHeartbeat();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') heartbeat(); });
  window.addEventListener('focus', heartbeat);

  // Wrap tail of init in try/finally to ensure loader hides even on non-fatal errors
  try {
    // Старт: на десктопе — сразу общий чат; на мобиле — открываем меню, ждём выбора
    if (isMobile()) {
      openDrawer();
      roomTitleEl.textContent = 'Выберите чат';
    } else {
      await switchRoom('global', 'Общий чат');
    }
    updateRoomStatus();

    // Настройка динамических переменных высоты для мобильных браузеров
    setupViewportVarHandlers();

    // По нажатию на кнопку меню — предложим установить PWA (если доступно)
    menuBtn.addEventListener('click', tryShowInstallPrompt, { once: true });
    // Settings listeners
    settingsBtn?.addEventListener('click', openSettings);
    settingsBackdrop?.addEventListener('click', closeSettings);
    settingsClose?.addEventListener('click', closeSettings);
    applyAppearanceBtn?.addEventListener('click', () => { applyAppearance(); closeSettings(); });
    liteToggle?.addEventListener('change', () => {
      const v = liteToggle.checked ? '1' : '0';
      try { localStorage.setItem('lite', v); } catch {}
      if (v === '1') document.body.classList.add('lite'); else document.body.classList.remove('lite');
    });
    installPWABtn?.addEventListener('click', tryShowInstallPrompt);
    fullscreenBtn?.addEventListener('click', toggleFullscreen);
    dimRange?.addEventListener('input', () => {
      const dim = parseFloat(dimRange.value || '0.6');
      if (!isNaN(dim)) setCSSVar('--chat-bg-dim', `rgba(0,0,0,${dim})`);
    });
    dimRange?.addEventListener('change', () => {
      const dim = parseFloat(dimRange.value || '0.6');
      if (!isNaN(dim)) try { localStorage.setItem('bgDim', String(dim)); } catch {}
    });
    compactToggle?.addEventListener('change', () => {
      const on = !!compactToggle.checked;
      document.body.classList.toggle('compact', on);
      try { localStorage.setItem('compact', on ? '1' : '0'); } catch {}
    });
    noAnimToggle?.addEventListener('change', () => {
      const on = !!noAnimToggle.checked;
      document.body.classList.toggle('no-anim', on);
      try { localStorage.setItem('noanim', on ? '1' : '0'); } catch {}
    });
    resetLocalBtn?.addEventListener('click', () => {
      if (!confirm('Сбросить локальные данные (ник, аватар, ЛС-список, настройки)?')) return;
      try {
        localStorage.removeItem('recentDMs');
        localStorage.removeItem('myProfile');
        localStorage.removeItem('lite');
        localStorage.removeItem('bgUrl');
        localStorage.removeItem('msgFontSize');
        localStorage.removeItem('bgDim');
        localStorage.removeItem('compact');
        localStorage.removeItem('noanim');
      } catch {}
      location.reload();
    });
    exportSettingsBtn?.addEventListener('click', () => {
      try {
        const payload = {
          lite: localStorage.getItem('lite') || '0',
          bgUrl: localStorage.getItem('bgUrl') || '',
          msgFontSize: localStorage.getItem('msgFontSize') || '14',
          bgDim: localStorage.getItem('bgDim') || '0.6',
          compact: localStorage.getItem('compact') || '0',
          noanim: localStorage.getItem('noanim') || '0',
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'chat-settings.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { alert('Не удалось экспортировать настройки'); }
    });
    importSettingsBtn?.addEventListener('click', () => importSettingsFile?.click());
    importSettingsFile?.addEventListener('change', () => {
      const f = importSettingsFile.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(String(reader.result || '{}')) || {};
          const keys = ['lite','bgUrl','msgFontSize','bgDim','compact','noanim'];
          keys.forEach(k => { if (k in obj) localStorage.setItem(k, String(obj[k])); });
          applySavedAppearance();
          syncSettingsForm();
          alert('Настройки импортированы');
        } catch (e) { alert('Некорректный файл настроек'); }
      };
      reader.readAsText(f);
      importSettingsFile.value = '';
    });
    // Global wipe: requires server-side Edge Function with admin privileges
    wipeAllBtn?.addEventListener('click', async () => {
      try {
        const ok1 = confirm('ВНИМАНИЕ: Будут удалены ВСЕ данные на сервере (сообщения, фото, аккаунты). Это необратимо. Продолжить?');
        if (!ok1) return;
        const phrase = prompt('Введите ПОДТВЕРЖДЕНИЕ: напишите "УДАЛИТЬ ВСЁ" (без кавычек)');
        if ((phrase || '').trim().toUpperCase() !== 'УДАЛИТЬ ВСЁ') { alert('Отменено'); return; }
        const adminToken = prompt('Введите админ-токен для Edge Function (его НЕЛЬЗЯ хранить в клиенте).');
        if (!adminToken) { alert('Отменено'); return; }
        showAppLoader();
        const res = await fetch(WIPE_ALL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ confirm: 'wipe_all' })
        });
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || 'Неизвестная ошибка');
        alert('Глобальное удаление выполнено. Приложение перезагрузится.');
        // Очистим локальные кэши тоже
        try {
          localStorage.clear();
          // Best-effort: wipe IndexedDB cache
          indexedDB.deleteDatabase('chatCache');
        } catch {}
        location.reload();
      } catch (e) {
        alert('Ошибка при глобальном удалении: ' + (e?.message || e));
      } finally {
        hideAppLoader(200);
      }
    });
  } finally {
    // Hide loader with a small minimum duration to avoid flashes
    hideAppLoader(700);
  }
})();

// (calls removed)

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
