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

// Состояние
let me = null; // { id, nick, ip_hash }
let currentRoomId = 'global';
let realtimeChannel = null;
let knownDMs = new Map(); // key: roomId, value: { peerNick, peerId }
let pollTimer = null;
let latestCreatedAt = null; // ISO timestamp of the newest message we know
let replyTarget = null; // { id, author, snippet }
const userCache = new Map(); // cache by userId -> {id, nick}

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
function renderMessage(msg) {
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

  messagesEl.appendChild(wrap);
  attachMessageHandlers(wrap, msg);
  // Обновим маркер последнего сообщения
  try {
    if (msg.created_at) {
      if (!latestCreatedAt || new Date(msg.created_at) > new Date(latestCreatedAt)) {
        latestCreatedAt = msg.created_at;
      }
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
    .limit(100);
  if (error) return console.error('loadMessages:', error);
  clearMessages();
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
    });
  });
  // Установим latestCreatedAt
  if (data && data.length) latestCreatedAt = data[0].created_at;
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
      if (m.room_id !== currentRoomId) return; // фильтрация по текущей комнате
      let replyObj = null;
      if (m.reply_to) {
        try {
          const rep = await fetchReply(m.reply_to);
          if (rep) replyObj = rep;
        } catch {}
      }
      renderMessage({ ...m, from_nick: m.from_user === me.id ? me.nick : null, reply: replyObj });
      scrollToBottom();
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
        }));
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
    item.addEventListener('click', () => openDM(u));
    dmListEl.appendChild(item);
  });
}

async function openDM(user) {
  const roomId = dmRoomId(me.id, user.id);
  knownDMs.set(roomId, { peerNick: user.nick, peerId: user.id });
  await switchRoom(roomId, `ЛС • ${user.nick}`);
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

globalChatItem.addEventListener('click', () => switchRoom('global', 'Общий чат'));

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

  // По умолчанию общий чат
  await switchRoom('global', 'Общий чат');
})();
