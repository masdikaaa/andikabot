const fs = require('fs');
const path = require('path');

/* ============ Storage ============ */
function dataPath() {
  return path.join(__dirname, '../data/userGroupData.json');
}

function loadUserGroupData() {
  try {
    const p = dataPath();
    if (!fs.existsSync(p)) {
      const defaultData = {
        antibadword: {},
        antilink: {},
        antitag: {},
        welcome: {},
        goodbye: {},
        chatbot: {},
        warnings: {},
        sudo: [],
        // >>> NEW: registration store
        registration: {
          users: [],          // { id, name, registeredAt, lastResetISO, quotaRemaining }
          limitPerWindow: 4,  // default limit
          windowHours: 12     // reset window
        }
      };
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('Error loading user group data:', err);
    return {
      antibadword: {},
      antilink: {},
      antitag: {},
      welcome: {},
      goodbye: {},
      chatbot: {},
      warnings: {},
      sudo: [],
      registration: {
        users: [],
        limitPerWindow: 4,
        windowHours: 12
      }
    };
  }
}

function saveUserGroupData(data) {
  try {
    const p = dataPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving user group data:', err);
    return false;
  }
}

/* ============ JID Utils (KUNCI) ============ */
function normalizeId(id) {
  if (!id) return '';
  const m = String(id).match(/\d{7,15}/);
  return m ? m[0] : '';
}
function toSwhatsAppJid(id) {
  const n = normalizeId(id);
  return n ? `${n}@s.whatsapp.net` : '';
}

/* ============ SUDO (raw JID + normalize) ============ */
async function isSudo(userId) {
  try {
    const data = loadUserGroupData();
    const list = Array.isArray(data.sudo) ? data.sudo : [];
    const raw = String(userId || '');
    const num = normalizeId(raw);
    return list.some(entry => entry === raw || (num && normalizeId(entry) === num));
  } catch (err) {
    console.error('Error checking sudo:', err);
    return false;
  }
}

async function addSudo(userJid) {
  try {
    const data = loadUserGroupData();
    if (!Array.isArray(data.sudo)) data.sudo = [];
    const raw = String(userJid || '');
    const hasAt = raw.includes('@');
    const num = normalizeId(raw);
    let changed = false;

    if (hasAt) {
      if (!data.sudo.includes(raw)) {
        data.sudo.push(raw);
        changed = true;
      }
    } else if (num) {
      const asJid = `${num}@s.whatsapp.net`;
      const exists = data.sudo.some(x => x === asJid || normalizeId(x) === num);
      if (!exists) {
        data.sudo.push(asJid);
        changed = true;
      }
    } else {
      return false;
    }

    if (changed) saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error adding sudo:', err);
    return false;
  }
}

async function removeSudo(userJid) {
  try {
    const data = loadUserGroupData();
    if (!Array.isArray(data.sudo)) data.sudo = [];
    const raw = String(userJid || '');
    const num = normalizeId(raw);

    const before = data.sudo.length;
    data.sudo = data.sudo.filter(entry => !(entry === raw || (num && normalizeId(entry) === num)));
    const changed = data.sudo.length !== before;
    if (changed) saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error removing sudo:', err);
    return false;
  }
}

async function getSudoList() {
  try {
    const data = loadUserGroupData();
    const list = Array.isArray(data.sudo) ? data.sudo : [];
    return list;
  } catch (err) {
    console.error('Error getting sudo list:', err);
    return [];
  }
}

/* ============ Antilink / Antitag / Warnings / Welcome / Goodbye / Chatbot ============ */
async function setAntilink(groupId, type, action) {
  try {
    const data = loadUserGroupData();
    if (!data.antilink) data.antilink = {};
    data.antilink[groupId] = { enabled: type === 'on', action: action || 'delete' };
    saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error setting antilink:', err);
    return false;
  }
}
async function getAntilink(groupId, type) {
  try {
    const data = loadUserGroupData();
    if (!data.antilink || !data.antilink[groupId]) return null;
    return type === 'on' ? data.antilink[groupId] : null;
  } catch (err) {
    console.error('Error getting antilink:', err);
    return null;
  }
}
async function removeAntilink(groupId) {
  try {
    const data = loadUserGroupData();
    if (data.antilink && data.antilink[groupId]) {
      delete data.antilink[groupId];
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error removing antilink:', err);
    return false;
  }
}

async function setAntitag(groupId, type, action) {
  try {
    const data = loadUserGroupData();
    if (!data.antitag) data.antitag = {};
    data.antitag[groupId] = { enabled: type === 'on', action: action || 'delete' };
    saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error setting antitag:', err);
    return false;
  }
}
async function getAntitag(groupId, type) {
  try {
    const data = loadUserGroupData();
    if (!data.antitag || !data.antitag[groupId]) return null;
    return type === 'on' ? data.antitag[groupId] : null;
  } catch (err) {
    console.error('Error getting antitag:', err);
    return null;
  }
}
async function removeAntitag(groupId) {
  try {
    const data = loadUserGroupData();
    if (data.antitag && data.antitag[groupId]) {
      delete data.antitag[groupId];
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error removing antitag:', err);
    return false;
  }
}

async function incrementWarningCount(groupId, userId) {
  try {
    const data = loadUserGroupData();
    if (!data.warnings) data.warnings = {};
    if (!data.warnings[groupId]) data.warnings[groupId] = {};
    const key = normalizeId(userId) || String(userId);
    if (!data.warnings[groupId][key]) data.warnings[groupId][key] = 0;
    data.warnings[groupId][key]++;
    saveUserGroupData(data);
    return data.warnings[groupId][key];
  } catch (err) {
    console.error('Error incrementing warning count:', err);
    return 0;
  }
}
async function resetWarningCount(groupId, userId) {
  try {
    const data = loadUserGroupData();
    const key = normalizeId(userId) || String(userId);
    if (data.warnings?.[groupId]?.[key] != null) {
      data.warnings[groupId][key] = 0;
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error resetting warning count:', err);
    return false;
  }
}

async function addWelcome(jid, enabled, message) {
  try {
    const data = loadUserGroupData();
    if (!data.welcome) data.welcome = {};
    data.welcome[jid] = {
      enabled,
      message: message || '╔═⚔️ WELCOME ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ 📜 Message:\n║ {description}\n╚═══════════════╝',
      channelId: '120363421594431163@newsletter'
    };
    saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error in addWelcome:', err);
    return false;
  }
}
async function delWelcome(jid) {
  try {
    const data = loadUserGroupData();
    if (data.welcome && data.welcome[jid]) {
      delete data.welcome[jid];
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error in delWelcome:', err);
    return false;
  }
}
async function isWelcomeOn(jid) {
  try {
    const data = loadUserGroupData();
    return !!(data.welcome && data.welcome[jid] && data.welcome[jid].enabled);
  } catch (err) {
    console.error('Error in isWelcomeOn:', err);
    return false;
  }
}

async function addGoodbye(jid, enabled, message) {
  try {
    const data = loadUserGroupData();
    if (!data.goodbye) data.goodbye = {};
    data.goodbye[jid] = {
      enabled,
      message: message || '╔═⚔️ GOODBYE ⚔️═╗\n║ 🛡️ User: {user}\n║ 🏰 Kingdom: {group}\n╠═══════════════╣\n║ ⚰️ We will never miss you!\n╚═══════════════╝',
      channelId: '120363421594431163@newsletter'
    };
    saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error in addGoodbye:', err);
    return false;
  }
}
async function delGoodBye(jid) {
  try {
    const data = loadUserGroupData();
    if (data.goodbye && data.goodbye[jid]) {
      delete data.goodbye[jid];
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error in delGoodBye:', err);
    return false;
  }
}
async function isGoodByeOn(jid) {
  try {
    const data = loadUserGroupData();
    return !!(data.goodbye && data.goodbye[jid] && data.goodbye[jid].enabled);
  } catch (err) {
    console.error('Error in isGoodByeOn:', err);
    return false;
  }
}

async function setAntiBadword(groupId, type, action) {
  try {
    const data = loadUserGroupData();
    if (!data.antibadword) data.antibadword = {};
    data.antibadword[groupId] = { enabled: type === 'on', action: action || 'delete' };
    saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error setting antibadword:', err);
    return false;
  }
}
async function getAntiBadword(groupId, type) {
  try {
    const data = loadUserGroupData();
    if (!data.antibadword || !data.antibadword[groupId]) return null;
    const config = data.antibadword[groupId];
    return type === 'on' ? config : null;
  } catch (err) {
    console.error('Error getting antibadword:', err);
    return null;
  }
}
async function removeAntiBadword(groupId) {
  try {
    const data = loadUserGroupData();
    if (data.antibadword && data.antibadword[groupId]) {
      delete data.antibadword[groupId];
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error removing antibadword:', err);
    return false;
  }
}

async function setChatbot(groupId, enabled) {
  try {
    const data = loadUserGroupData();
    if (!data.chatbot) data.chatbot = {};
    data.chatbot[groupId] = { enabled };
    saveUserGroupData(data);
    return true;
  } catch (err) {
    console.error('Error setting chatbot:', err);
    return false;
  }
}
async function getChatbot(groupId) {
  try {
    const data = loadUserGroupData();
    return data.chatbot?.[groupId] || null;
  } catch (err) {
    console.error('Error getting chatbot:', err);
    return null;
  }
}
async function removeChatbot(groupId) {
  try {
    const data = loadUserGroupData();
    if (data.chatbot && data.chatbot[groupId]) {
      delete data.chatbot[groupId];
      saveUserGroupData(data);
    }
    return true;
  } catch (err) {
    console.error('Error removing chatbot:', err);
    return false;
  }
}

/* ============ NEW: REGISTRATION + LIMIT HELPERS ============ */
function _getRegStore() {
  const data = loadUserGroupData();
  if (!data.registration) {
    data.registration = { users: [], limitPerWindow: 4, windowHours: 12 };
    saveUserGroupData(data);
  }
  if (!Array.isArray(data.registration.users)) data.registration.users = [];
  if (!data.registration.limitPerWindow) data.registration.limitPerWindow = 4;
  if (!data.registration.windowHours) data.registration.windowHours = 12;
  return data;
}

function isMemberRegistered(userId) {
  const data = _getRegStore();
  const num = normalizeId(userId);
  return data.registration.users.some(u => normalizeId(u.id) === num);
}

function registerMember(userId, displayName) {
  const data = _getRegStore();
  const num = normalizeId(userId);
  const already = data.registration.users.find(u => normalizeId(u.id) === num);
  if (already) return false;
  const now = new Date();
  data.registration.users.push({
    id: toSwhatsAppJid(num),
    name: displayName || num,
    registeredAt: now.toISOString(),
    lastResetISO: now.toISOString(),
    quotaRemaining: data.registration.limitPerWindow
  });
  saveUserGroupData(data);
  return true;
}

function _maybeReset(user) {
  const data = _getRegStore();
  const hrs = data.registration.windowHours;
  const lim = data.registration.limitPerWindow;
  const last = user.lastResetISO ? new Date(user.lastResetISO).getTime() : 0;
  const now = Date.now();
  if (now - last >= hrs * 3600 * 1000) {
    user.quotaRemaining = lim;
    user.lastResetISO = new Date(now).toISOString();
    saveUserGroupData(data);
  }
}

function _getUserRef(userId) {
  const data = _getRegStore();
  const num = normalizeId(userId);
  const idx = data.registration.users.findIndex(u => normalizeId(u.id) === num);
  return { data, idx };
}

function getRemainingQuota(userId) {
  const { data, idx } = _getUserRef(userId);
  if (idx === -1) return 0;
  const user = data.registration.users[idx];
  _maybeReset(user);
  return user.quotaRemaining;
}

function consumeQuota(userId) {
  const { data, idx } = _getUserRef(userId);
  if (idx === -1) return false;
  const user = data.registration.users[idx];
  _maybeReset(user);
  if (user.quotaRemaining <= 0) return false;
  user.quotaRemaining -= 1;
  saveUserGroupData(data);
  return true;
}

function timeUntilReset(userId) {
  const { data, idx } = _getUserRef(userId);
  if (idx === -1) return 0;
  const user = data.registration.users[idx];
  const hrs = data.registration.windowHours;
  const last = user.lastResetISO ? new Date(user.lastResetISO).getTime() : 0;
  const next = last + hrs * 3600 * 1000;
  const leftMs = Math.max(0, next - Date.now());
  return leftMs;
}

function formatDuration(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}j`);
  if (m) parts.push(`${m}m`);
  if (sec && parts.length === 0) parts.push(`${sec}d`);
  return parts.join(' ') || '0d';
}

function getRegisteredList() {
  const data = _getRegStore();
  return data.registration.users.slice(); // shallow copy
}

function deleteRegisteredByIndex(oneBasedIndex) {
  const data = _getRegStore();
  const i = Number(oneBasedIndex);
  if (!Number.isInteger(i) || i < 1 || i > data.registration.users.length) return { ok: false };
  const removed = data.registration.users.splice(i - 1, 1)[0];
  saveUserGroupData(data);
  return { ok: true, removed };
}

/* ============ Exports ============ */
module.exports = {
  // utils
  normalizeId,
  toSwhatsAppJid,

  // sudo
  isSudo,
  addSudo,
  removeSudo,
  getSudoList,

  // features existing
  setAntilink,
  getAntilink,
  removeAntilink,
  setAntitag,
  getAntitag,
  removeAntitag,
  incrementWarningCount,
  resetWarningCount,
  addWelcome,
  delWelcome,
  isWelcomeOn,
  addGoodbye,
  delGoodBye,
  isGoodByeOn,
  setAntiBadword,
  getAntiBadword,
  removeAntiBadword,
  setChatbot,
  getChatbot,
  removeChatbot,

  // NEW registration/limit
  isMemberRegistered,
  registerMember,
  getRemainingQuota,
  consumeQuota,
  timeUntilReset,
  formatDuration,
  getRegisteredList,
  deleteRegisteredByIndex
};
