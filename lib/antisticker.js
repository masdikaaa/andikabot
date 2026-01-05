// lib/antisticker.js
// AntiSticker — batas stiker per user dengan cooldown 60s
// Fitur: limit >= 0 (0 = SEMUA stiker ditindak), anti false-positive (leeway),
// de-dupe & throttle delete, PER-USER MUTEX (grup besar), dan post-cooldown NO-DELETE grace.

'use strict';

const fs = require('fs');
const path = require('path');
const { isJidGroup, jidNormalizedUser } = require('@whiskeysockets/baileys');
const isAdmin = require('./isAdmin');
const { isSudo } = require('../lib/index');

// ===== File paths =====
const DATA_DIR   = path.join(__dirname, '../data');
const CFG_PATH   = path.join(DATA_DIR, 'antisticker.json');         // konfigurasi per grup
const STATE_PATH = path.join(DATA_DIR, 'antisticker_state.json');   // state hitung & cooldown

// ===== Helpers file =====
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CFG_PATH))   fs.writeFileSync(CFG_PATH,   JSON.stringify({}, null, 2));
  if (!fs.existsSync(STATE_PATH)) fs.writeFileSync(STATE_PATH, JSON.stringify({}, null, 2));
}
function readJSON(p) {
  ensureDataFiles();
  try { return JSON.parse(fs.readFileSync(p, 'utf8') || '{}'); }
  catch { return {}; }
}
function writeJSON(p, obj) {
  ensureDataFiles();
  fs.writeFileSync(p, JSON.stringify(obj || {}, null, 2));
}

// ===== Konfigurasi & State API (dipakai juga oleh command) =====
function getAntiStickerConfig(jid) {
  const cfg = readJSON(CFG_PATH);
  const d = cfg[jid] || { enabled: false, limit: 2, action: 'delete' };
  if (!Number.isFinite(d.limit) || d.limit < 0) d.limit = 0; // clamp negatif -> 0
  d.action = ['delete', 'warn', 'kick'].includes(String(d.action || '').toLowerCase())
    ? String(d.action).toLowerCase() : 'delete';
  return d;
}
function setAntiStickerConfig(jid, next) {
  const cfg = readJSON(CFG_PATH);
  const cur = cfg[jid] || {};

  const nextLimit = Number.isFinite(next.limit) ? Math.floor(next.limit) : cur.limit;
  const safeLimit = (Number.isFinite(nextLimit) && nextLimit >= 0) ? nextLimit : 2;

  const nextAction = String(next.action || '').toLowerCase();
  const safeAction = ['delete', 'warn', 'kick'].includes(nextAction)
    ? nextAction
    : (cur.action || 'delete');

  cfg[jid] = {
    enabled: !!next.enabled,
    limit: safeLimit,
    action: safeAction
  };
  writeJSON(CFG_PATH, cfg);
  return cfg[jid];
}
function readState()  { return readJSON(STATE_PATH); }
function writeState(s){ writeJSON(STATE_PATH, s); }

// Reset penghitung user / semua user di grup
function resetUserCount(jid, user) {
  const st = readState();
  if (st[jid] && st[jid][user]) {
    st[jid][user].count = 0;
    st[jid][user].cooldownUntil = 0;
    st[jid][user].warns = 0;
    st[jid][user].lastMsgId = '';
    st[jid][user].lastDeleteAt = 0;
    st[jid][user].cooldownEndedAt = 0;
  }
  writeState(st);
}
function resetAllCount(jid) {
  const st = readState();
  if (st[jid]) {
    Object.values(st[jid]).forEach(v => {
      v.count = 0; v.cooldownUntil = 0; v.warns = 0;
      v.lastMsgId = ''; v.lastDeleteAt = 0; v.cooldownEndedAt = 0;
    });
    writeState(st);
  }
}

// ====== UI ======
function fmtSec(ms) { return Math.max(0, Math.ceil((Number(ms) || 0) / 1000)); }
function now() { return Date.now(); }

function buildCard({ title = 'AntiSticker', userDigits, limit, action, warns, warnLimit = 3, cooldownMs = 60000 }) {
  const lines = [
    '🧱 *' + title + '*',
    (limit === 0)
      ? `• @${userDigits} mengirim stiker saat mode *limit=0* (semua stiker ditindak)`
      : `• @${userDigits} melewati batas stiker (>${limit})`,
    `• Cooldown: *${fmtSec(cooldownMs)} detik* (selama ini semua stiker kamu akan dihapus)`,
    '',
    `Aksi: *${String(action).toUpperCase()}*${action === 'warn' ? ` (total: ${warns || 0})` : ''}`,
  ];
  if (action === 'warn') {
    const sisa = Math.max(0, warnLimit - (Number(warns) || 0));
    const note = sisa > 0
      ? `⚠️ Catatan: bila peringatan mencapai *${warnLimit}*, kamu akan di-*kick* otomatis. (Sisa: ${sisa})`
      : `👢 Batas peringatan *${warnLimit}* tercapai — akan di-*kick*.`;
    lines.push('', note);
  }
  return lines.join('\n');
}

// ====== Core ======
const COOLDOWN_MS_DEFAULT = 60 * 1000;          // 60 detik
const WARN_LIMIT = 3;
const MAX_REASONABLE_COOLDOWN_MS = 10 * 60 * 1000; // 10 menit

// Anti false-positive & duplikasi event
const COOLDOWN_LEEWAY_MS = 10_000;              // 10s toleransi setelah cooldown
const DELETE_THROTTLE_MS = 1000;                // jeda antar delete
const POST_COOLDOWN_GRACE_MS = 3000;            // anti flap ke cooldown lagi
const POST_COOLDOWN_NO_DELETE_MS = 5000;        // 5s pertama: jangan hapus (limit >= 1)

// Per-user mutex (serial processing per (jid, user))
const _MUTEX = new Map();
function _key(jid, user) { return `${jid}::${user}`; }
function runExclusive(key, fn) {
  const prev = _MUTEX.get(key) || Promise.resolve();
  const p = prev.then(fn).catch(err => { throw err; }).finally(() => {
    if (_MUTEX.get(key) === p) _MUTEX.delete(key);
  });
  _MUTEX.set(key, p);
  return p;
}

async function AntiSticker(msg, sock) {
  try {
    const jid = msg?.key?.remoteJid;
    if (!jid || !isJidGroup(jid)) return;

    const m = msg.message || {};
    const isSticker = !!m.stickerMessage;
    if (!isSticker) return;

    const rawSender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid;
    const sender = rawSender ? jidNormalizedUser(rawSender) : null;
    if (!sender || sender.endsWith('@g.us')) return;

    const lockKey = _key(jid, sender);
    await runExclusive(lockKey, async () => {
      const userDigits = (sender.split('@')[0] || '').trim();

      // Admin / sudo bypass
      let bypass = false;
      try {
        const { isSenderAdmin } = await isAdmin(sock, jid, sender);
        if (isSenderAdmin) bypass = true;
      } catch {}
      if (await isSudo(sender).catch(() => false)) bypass = true;
      if (bypass) return;

      // Bot admin?
      let botIsAdmin = false;
      try {
        const { isBotAdmin } = await isAdmin(sock, jid, sender);
        botIsAdmin = !!isBotAdmin;
      } catch { botIsAdmin = false; }

      // Config
      const cfg = getAntiStickerConfig(jid);
      if (!cfg.enabled) return;

      const limit      = Number(cfg.limit);
      const action     = String(cfg.action || 'delete').toLowerCase();
      const cooldownMs = COOLDOWN_MS_DEFAULT;

      // State
      const state = readState();
      if (!state[jid]) state[jid] = {};
      if (!state[jid][sender]) state[jid][sender] = {
        count: 0, warns: 0, cooldownUntil: 0,
        lastMsgId: '', lastDeleteAt: 0, cooldownEndedAt: 0
      };
      const st = state[jid][sender];

      const nowMs = now();
      let cooldownUntil = Number(st.cooldownUntil || 0);
      if (!Number.isFinite(cooldownUntil)) cooldownUntil = 0;

      // clock drift guard
      if (cooldownUntil && Math.abs(cooldownUntil - nowMs) > MAX_REASONABLE_COOLDOWN_MS) {
        cooldownUntil = 0;
        st.cooldownUntil = 0;
        st.count = 0;
        st.cooldownEndedAt = nowMs;
        writeState(state);
      }

      // de-dupe by message id
      const curMsgId = msg?.key?.id || '';
      if (curMsgId && st.lastMsgId === curMsgId) return;

      // === COOLDOWN & LEEWAY ===
      if (cooldownUntil) {
        const remaining = cooldownUntil - nowMs;

        // kalau sudah masuk jendela leeway → anggap cooldown selesai
        if (remaining <= COOLDOWN_LEEWAY_MS) {
          st.cooldownUntil = 0;
          st.count = 0;
          st.cooldownEndedAt = nowMs; // penanda untuk post-cooldown grace
          cooldownUntil = 0;
          // lanjut: proses sebagai stiker "setelah cooldown"
        } else {
          // masih cooldown → hapus (throttle)
          if (botIsAdmin) {
            if (nowMs - (st.lastDeleteAt || 0) >= DELETE_THROTTLE_MS) {
              try { await sock.sendMessage(jid, { delete: msg.key }); } catch {}
              st.lastDeleteAt = nowMs;
            }
          }
          st.lastMsgId = curMsgId;
          writeState(state);
          return;
        }
      }

      // === POST-COOLDOWN GRACE: jangan balik ke cooldown mode karena jitter ===
      const inNoDeleteGrace = (st.cooldownEndedAt && (nowMs - st.cooldownEndedAt) <= POST_COOLDOWN_NO_DELETE_MS);
      const inLightGrace    = (st.cooldownEndedAt && (nowMs - st.cooldownEndedAt) <= POST_COOLDOWN_GRACE_MS);

      // ====== cooldown tidak aktif ======
      st.count = Number(st.count || 0) + 1;

      // Jika limit >=1 dan masih dalam no-delete grace → jangan pernah hapus
      if (limit >= 1 && inNoDeleteGrace) {
        // clamp counter biar tidak langsung meledak di grace
        if (st.count > limit) st.count = limit;
        st.lastMsgId = curMsgId;
        writeState(state);
        return;
      }

      // aturan normal:
      // - limit >= 1  → aman sampai count <= limit
      // - limit == 0  → stiker pertama langsung pelanggaran (count=1 > 0)
      if (st.count <= limit) {
        st.lastMsgId = curMsgId;
        writeState(state);
        return;
      }

      // Melewati limit → set cooldown & reset counter
      // (kecuali masih dalam light grace? tidak—light grace hanya cegah "flap" di atas)
      st.cooldownUntil = nowMs + cooldownMs;
      st.count = 0;
      st.cooldownEndedAt = 0;

      // Hapus pesan pelanggaran
      if (botIsAdmin) {
        if (nowMs - (st.lastDeleteAt || 0) >= DELETE_THROTTLE_MS) {
          try { await sock.sendMessage(jid, { delete: msg.key }); } catch {}
          st.lastDeleteAt = nowMs;
        }
      }

      if (action === 'delete') {
        const text = buildCard({
          title: 'AntiSticker',
          userDigits,
          limit,
          action: 'delete',
          cooldownMs
        });
        await sock.sendMessage(jid, { text, mentions: [sender] });
      } else if (action === 'warn') {
        st.warns = Number(st.warns || 0) + 1;
        if (st.warns >= WARN_LIMIT) {
          if (botIsAdmin) {
            try { await sock.groupParticipantsUpdate(jid, [sender], 'remove'); } catch {}
          }
          st.warns = 0;
          st.count = 0;
          st.cooldownUntil = 0;
          st.cooldownEndedAt = nowMs;

          const text = [
            '🧱 *AntiSticker — KICK*',
            `• @${userDigits} mencapai *${WARN_LIMIT}* peringatan.`,
            '• Anggota dikeluarkan dari grup.'
          ].join('\n');
          await sock.sendMessage(jid, { text, mentions: [sender] });
        } else {
          const text = buildCard({
            title: 'AntiSticker',
            userDigits,
            limit,
            action: 'warn',
            warns: st.warns,
            warnLimit: WARN_LIMIT,
            cooldownMs
          });
          await sock.sendMessage(jid, { text, mentions: [sender] });
        }
      } else if (action === 'kick') {
        if (botIsAdmin) {
          try { await sock.groupParticipantsUpdate(jid, [sender], 'remove'); } catch {}
        }
        const text = [
          '🧱 *AntiSticker — KICK*',
          `• @${userDigits} melewati batas stiker (>${limit}).`,
          '• Anggota dikeluarkan dari grup.'
        ].join('\n');
        await sock.sendMessage(jid, { text, mentions: [sender] });
        st.count = 0; st.cooldownUntil = 0; st.warns = 0; st.cooldownEndedAt = nowMs;
      }

      st.lastMsgId = curMsgId;
      writeState(state);
    });
  } catch (err) {
    console.error('AntiSticker error:', err);
  }
}

module.exports = {
  AntiSticker,
  // helpers untuk command
  getAntiStickerConfig,
  setAntiStickerConfig,
  readState,
  writeState,
  resetUserCount,
  resetAllCount,
  CFG_PATH,
  STATE_PATH
};
