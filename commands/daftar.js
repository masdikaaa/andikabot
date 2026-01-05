// commands/daftar.js — FINAL (Baileys v7 safe)
'use strict';

const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

// Optional imports (fallback disiapkan jika tidak ada di ../lib/index)
let normalizeId = null;
let isSudo = null;
try {
  ({ normalizeId, isSudo } = require('../lib/index'));
} catch (_) { /* fallback below */ }

// ===== Konstanta Limit =====
const REG_PATH = path.join(__dirname, '../data/registrations.json');
const LIMIT_PER_WINDOW = 4;           // default kuota / 12 jam
const RESET_MS = 12 * 60 * 60 * 1000; // 12 jam

/* =========================
   STORAGE (PER-GROUP)
   Struktur:
   {
     "groups": {
       "<chatId>@g.us": {
         "users": {
           "<userJid>": { since, quotaLeft, lastReset }
         }
       }
     }
   }

   Backward-compat: kalau ketemu format lama { users:{} } → dipindah ke groups["__legacy__"]
========================= */

function ensureRegFile() {
  try {
    if (!fs.existsSync(path.dirname(REG_PATH))) {
      fs.mkdirSync(path.dirname(REG_PATH), { recursive: true });
    }
    if (!fs.existsSync(REG_PATH)) {
      fs.writeFileSync(REG_PATH, JSON.stringify({ groups: {} }, null, 2));
    }
  } catch (e) {
    console.error('Gagal memastikan registrations.json:', e);
  }
}

function _migrateIfNeeded(json) {
  // lama: { users:{} }
  if (json && !json.groups && json.users && typeof json.users === 'object') {
    json = { groups: { '__legacy__': { users: json.users } } };
  }
  if (!json.groups || typeof json.groups !== 'object') json.groups = {};
  return json;
}

function loadRegs() {
  ensureRegFile();
  try {
    const raw = fs.readFileSync(REG_PATH, 'utf8');
    const json = JSON.parse(raw || '{}');
    return _migrateIfNeeded(json);
  } catch (e) {
    console.error('Gagal baca registrations.json:', e);
    return { groups: {} };
  }
}

function saveRegs(data) {
  try {
    fs.writeFileSync(REG_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Gagal tulis registrations.json:', e);
    return false;
  }
}

function ensureGroup(db, chatId) {
  if (!db.groups) db.groups = {};
  if (!db.groups[chatId]) db.groups[chatId] = { users: {} };
  if (!db.groups[chatId].users || typeof db.groups[chatId].users !== 'object') {
    db.groups[chatId].users = {};
  }
  return db.groups[chatId].users;
}

/* ========= Helpers ========= */

// Fallback normalizeId kalau tidak ada dari ../lib/index
const normalizeDigits = (str = '') => {
  const onlyDigits = String(str).replace(/\D+/g, '');
  // Ambil 7–15 digit paling akhir/masuk akal
  if (!onlyDigits) return null;
  if (onlyDigits.length > 15) return onlyDigits.slice(-15);
  if (onlyDigits.length < 7) return null;
  return onlyDigits;
};
if (typeof normalizeId !== 'function') normalizeId = normalizeDigits;

// Ambil teks dari berbagai tipe pesan (conversation, extended, caption)
function getText(message) {
  return (
    message?.message?.conversation ??
    message?.message?.extendedTextMessage?.text ??
    message?.message?.imageMessage?.caption ??
    message?.message?.videoMessage?.caption ??
    ''
  ).trim();
}

// Helper tampilkan mention @62… (display only)
function mention62(jidOrNum) {
  const raw = String(jidOrNum || '');
  let theDigits = normalizeId(raw); // ambil 7–15 digit
  if (!theDigits) return '@unknown';

  let msisdn = theDigits;
  if (msisdn.startsWith('0')) {
    msisdn = '62' + msisdn.slice(1);
  } else if (msisdn.startsWith('8')) {
    msisdn = '62' + msisdn;
  }
  // jika sudah 62… biarkan
  return '@' + msisdn;
}

// Reset kuota jika lewat 12 jam
function maybeReset(user) {
  const now = Date.now();
  if (!user.lastReset) user.lastReset = now;
  if (now - user.lastReset >= RESET_MS) {
    user.quotaLeft = LIMIT_PER_WINDOW;
    user.lastReset = now;
  }
}

function formatDuration(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}j`);
  if (m) parts.push(`${m}m`);
  // pakai "d" = detik (sesuai style kamu)
  if (sec || !parts.length) parts.push(`${sec}d`);
  return parts.join(' ');
}

/* ====== Public API (PER-GROUP) ====== */
function isMemberRegistered(chatId, userJid) {
  const db = loadRegs();
  const groupUsers = ensureGroup(db, chatId);
  return !!groupUsers[userJid];
}

function getRemainingQuota(chatId, userJid) {
  const db = loadRegs();
  const groupUsers = ensureGroup(db, chatId);
  if (!groupUsers[userJid]) return 0;
  maybeReset(groupUsers[userJid]);
  saveRegs(db);
  return groupUsers[userJid].quotaLeft ?? 0;
}

function consumeQuota(chatId, userJid) {
  const db = loadRegs();
  const groupUsers = ensureGroup(db, chatId);
  if (!groupUsers[userJid]) return false;
  maybeReset(groupUsers[userJid]);
  const cur = groupUsers[userJid].quotaLeft ?? 0;
  if (cur <= 0) { saveRegs(db); return false; }
  groupUsers[userJid].quotaLeft = cur - 1;
  saveRegs(db);
  return true;
}

function timeUntilReset(chatId, userJid) {
  const db = loadRegs();
  const groupUsers = ensureGroup(db, chatId);
  if (!groupUsers[userJid]) return 0;
  const since = groupUsers[userJid].lastReset || Date.now();
  const left = RESET_MS - (Date.now() - since);
  return left > 0 ? left : 0;
}

/* =================== Commands =================== */
async function daftarCommand(sock, chatId, message) {
  try {
    const senderJid = message?.key?.participant || message?.key?.remoteJid;

    // Sudo/Admin/Owner auto pass: tidak perlu daftar
    const sudo = await Promise.resolve(isSudo?.(senderJid));
    let adminOk = false;
    try {
      const st = await isAdmin(sock, chatId, senderJid, message);
      adminOk = !!st?.isSenderAdmin;
    } catch {}

    if (sudo || message?.key?.fromMe || adminOk) {
      const badge = sudo ? 'sudo' : (message?.key?.fromMe ? 'owner' : 'admin');
      await sock.sendMessage(chatId, { text: `✅ Kamu terdeteksi sebagai *${badge}* → tidak perlu daftar.` }, { quoted: message });
      return;
    }

    const db = loadRegs();
    const groupUsers = ensureGroup(db, chatId);

    if (groupUsers[senderJid]) {
      // sudah terdaftar (di grup ini)
      maybeReset(groupUsers[senderJid]);
      saveRegs(db);
      const left = groupUsers[senderJid].quotaLeft ?? 0;
      const leftTime = formatDuration(timeUntilReset(chatId, senderJid));
      const txt =
        `✅ *Kamu sudah terdaftar di grup ini!*\n\n` +
        `👤 User : ${mention62(senderJid)}\n` +
        `🎯 Sisa kuota : *${left}* / ${LIMIT_PER_WINDOW}\n` +
        `⏳ Reset dalam : *${leftTime}*`;
      await sock.sendMessage(chatId, { text: txt, mentions: [senderJid] }, { quoted: message });
      return;
    }

    // daftar baru (di grup ini)
    groupUsers[senderJid] = {
      since: Date.now(),
      quotaLeft: LIMIT_PER_WINDOW,
      lastReset: Date.now()
    };
    saveRegs(db);

    const txt =
      `🎉 *Pendaftaran Berhasil (Grup Ini)!*\n\n` +
      `👤 User : ${mention62(senderJid)}\n` +
      `🎯 Kuota awal : *${LIMIT_PER_WINDOW}* per 12 jam\n` +
      `ℹ️ Cek sisa kuota: *.limit*\n` +
      `📜 Lihat semua menu: *.menu*`;
    await sock.sendMessage(chatId, { text: txt, mentions: [senderJid] }, { quoted: message });
  } catch (e) {
    console.error('Error .daftar:', e);
    await sock.sendMessage(chatId, { text: '❌ Gagal memproses pendaftaran.' }, { quoted: message });
  }
}

async function limitCommand(sock, chatId, message) {
  try {
    const senderJid = message?.key?.participant || message?.key?.remoteJid;

    // cek privilege
    const sudo = await Promise.resolve(isSudo?.(senderJid));
    let adminOk = false;
    try {
      const st = await isAdmin(sock, chatId, senderJid, message);
      adminOk = !!st?.isSenderAdmin;
    } catch {}
    const isPriv = sudo || message?.key?.fromMe || adminOk;

    // ambil context (reply & mention)
    const ctx = message?.message?.extendedTextMessage?.contextInfo || {};
    const mentions = (ctx.mentionedJid || []).filter(Boolean);
    const replyTarget = ctx.participant || null;

    // tentukan target(s)
    let targets = [senderJid];
    if ((mentions.length || replyTarget) && isPriv) {
      targets = mentions.length ? mentions : [replyTarget]; // support multi-mention
    } else if ((mentions.length || replyTarget) && !isPriv) {
      await sock.sendMessage(
        chatId,
        { text: '🔒 Hanya Owner/Sudo/Admin yang bisa cek limit user lain. Menampilkan limit kamu sendiri.' },
        { quoted: message }
      );
    }

    const db = loadRegs();
    const groupUsers = ensureGroup(db, chatId);

    for (const targetJid of targets) {
      if (!groupUsers[targetJid]) {
        if (targetJid === senderJid) {
          await sock.sendMessage(
            chatId,
            { text: '📝 *Kamu belum terdaftar di grup ini.*\nSilakan daftar dengan *.daftar* dulu.' },
            { quoted: message }
          );
        } else {
          await sock.sendMessage(
            chatId,
            { text: `⚠️ User ${mention62(targetJid)} belum terdaftar di grup ini.`, mentions: [targetJid] },
            { quoted: message }
          );
        }
        continue;
      }

      // reset window kalau sudah lewat 12 jam
      maybeReset(groupUsers[targetJid]);
      saveRegs(db);

      const left = groupUsers[targetJid].quotaLeft ?? 0;
      const leftTime = formatDuration(timeUntilReset(chatId, targetJid));

      const txt =
        `📊 *Sisa Kuota Perintah (Grup Ini)*\n\n` +
        `👤 User : ${mention62(targetJid)}\n` +
        `🎯 Sisa : *${left}* / ${LIMIT_PER_WINDOW}\n` +
        `⏳ Reset dalam : *${leftTime}*\n\n` +
        `💡 Perintah ini *gratis* (tidak mengurangi kuota).`;

      await sock.sendMessage(chatId, { text: txt, mentions: [targetJid] }, { quoted: message });
    }
  } catch (e) {
    console.error('Error .limit:', e);
    await sock.sendMessage(chatId, { text: '❌ Gagal menampilkan limit.' }, { quoted: message });
  }
}

// Owner/Sudo/Admin: daftar user per-grup
async function reglistCommand(sock, chatId, message) {
  try {
    const senderJid = message?.key?.participant || message?.key?.remoteJid;
    const sudo = await Promise.resolve(isSudo?.(senderJid));
    let adminOk = false;
    try {
      const st = await isAdmin(sock, chatId, senderJid, message);
      adminOk = !!st?.isSenderAdmin;
    } catch {}

    if (!sudo && !message?.key?.fromMe && !adminOk) {
      await sock.sendMessage(chatId, { text: '🔒 Perintah ini hanya untuk Owner/Sudo/Admin.' }, { quoted: message });
      return;
    }

    const db = loadRegs();
    const groupUsers = ensureGroup(db, chatId);
    const jids = Object.keys(groupUsers);
    if (!jids.length) {
      await sock.sendMessage(chatId, { text: '📂 Belum ada user terdaftar di grup ini.' }, { quoted: message });
      return;
    }

    const lines = [];
    lines.push('🧾 *DAFTAR USER TERDAFTAR (Grup Ini)*');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    jids.forEach((jid, i) => {
      lines.push(`${i + 1}. ${mention62(jid)}`);
    });
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`Total: *${jids.length}* user\n`);
    lines.push('🗑 Hapus user: *.regdel <nomor_urut>* atau balas pesan user');

    await sock.sendMessage(chatId, {
      text: lines.join('\n'),
      mentions: jids
    }, { quoted: message });
  } catch (e) {
    console.error('Error .reglist:', e);
    await sock.sendMessage(chatId, { text: '❌ Gagal menampilkan daftar registrasi.' }, { quoted: message });
  }
}

// Hapus berdasarkan nomor urut / reply pada grup ini
async function regdelCommand(sock, chatId, message, indexArg) {
  try {
    const senderJid = message?.key?.participant || message?.key?.remoteJid;
    const sudo = await Promise.resolve(isSudo?.(senderJid));
    let adminOk = false;
    try {
      const st = await isAdmin(sock, chatId, senderJid, message);
      adminOk = !!st?.isSenderAdmin;
    } catch {}

    if (!sudo && !message?.key?.fromMe && !adminOk) {
      await sock.sendMessage(chatId, { text: '🔒 Perintah ini hanya untuk Owner/Sudo/Admin.' }, { quoted: message });
      return;
    }

    const ctx = message?.message?.extendedTextMessage?.contextInfo || {};
    const quotedJid = ctx.participant;
    const hasQuotedUser = !!quotedJid;

    const idx = parseInt(String(indexArg || '').trim(), 10);
    if (!hasQuotedUser && (isNaN(idx) || idx <= 0)) {
      await sock.sendMessage(chatId, { text: '⚠️ Format: *.regdel <nomor_urut>* atau *balas pesan user*.' }, { quoted: message });
      return;
    }

    const db = loadRegs();
    const groupUsers = ensureGroup(db, chatId);
    const jids = Object.keys(groupUsers);

    if (hasQuotedUser) {
      if (!groupUsers[quotedJid]) {
        await sock.sendMessage(chatId, { text: '⚠️ User itu tidak terdaftar di grup ini.' }, { quoted: message });
        return;
      }
      delete groupUsers[quotedJid];
      saveRegs(db);
      const txt = `✅ Registrasi dihapus.\n*User:* ${mention62(quotedJid)}`;
      await sock.sendMessage(chatId, { text: txt, mentions: [quotedJid] }, { quoted: message });
      return;
    }

    if (!jids.length) {
      await sock.sendMessage(chatId, { text: '📂 Belum ada user terdaftar di grup ini.' }, { quoted: message });
      return;
    }
    if (idx > jids.length) {
      await sock.sendMessage(chatId, { text: `⚠️ Nomor urut tidak valid. Maksimal: *${jids.length}*` }, { quoted: message });
      return;
    }

    const targetJid = jids[idx - 1];
    delete groupUsers[targetJid];
    saveRegs(db);

    const txt =
      `✅ Registrasi dihapus.\n` +
      `*Nomor urut:* ${idx}\n` +
      `*User:* ${mention62(targetJid)}`;
    await sock.sendMessage(chatId, { text: txt, mentions: [targetJid] }, { quoted: message });
  } catch (e) {
    console.error('Error .regdel:', e);
    await sock.sendMessage(chatId, { text: '❌ Gagal menghapus registrasi.' }, { quoted: message });
  }
}

/* ===============================
   LIMITADD & LIMITDEL (Owner/Sudo/Admin) — PER GRUP
   Sintaks:
   .limitadd <jumlah> @user   (bisa multi-mention)
   .limitdel <jumlah> @user
   atau balas/reply pesan user (tanpa mention)
   Jika salah format → tampilkan cara pakai.
================================ */
async function limitAdjustCommand(sock, chatId, message, type /* 'add'|'del' */) {
  try {
    const senderJid = message?.key?.participant || message?.key?.remoteJid;
    const sudo = await Promise.resolve(isSudo?.(senderJid));
    let adminOk = false;
    try {
      const st = await isAdmin(sock, chatId, senderJid, message);
      adminOk = !!st?.isSenderAdmin;
    } catch {}

    if (!sudo && !message?.key?.fromMe && !adminOk) {
      await sock.sendMessage(chatId, { text: '🔒 Perintah ini hanya untuk Owner/Sudo/Admin.' }, { quoted: message });
      return;
    }

    const raw = getText(message);
    const parts = raw.split(/\s+/);
    const amountStr = parts[1];
    const amount = parseInt(amountStr, 10);

    const usageAdd = '⚙️ Format: *.limitadd <jumlah> @user* atau *balas pesan user*\nContoh: *.limitadd 1 @orang*';
    const usageDel = '⚙️ Format: *.limitdel <jumlah> @user* atau *balas pesan user*\nContoh: *.limitdel 1 @orang*';

    if (isNaN(amount) || amount <= 0) {
      await sock.sendMessage(chatId, { text: type === 'add' ? usageAdd : usageDel }, { quoted: message });
      return;
    }

    const ctx = message?.message?.extendedTextMessage?.contextInfo || {};
    const mentions = (ctx.mentionedJid || []).filter(Boolean);
    const replyTarget = ctx.participant;
    if (!mentions.length && !replyTarget) {
      await sock.sendMessage(chatId, { text: type === 'add' ? usageAdd : usageDel }, { quoted: message });
      return;
    }

    const db = loadRegs();
    const groupUsers = ensureGroup(db, chatId);
    const targets = mentions.length ? mentions : [replyTarget];

    const results = [];
    const toMention = [];

    for (const jid of targets) {
      toMention.push(jid);
      if (!groupUsers[jid]) {
        results.push(`• ${mention62(jid)} — ❌ belum terdaftar di grup ini`);
        continue;
      }
      maybeReset(groupUsers[jid]);

      if (type === 'add') {
        groupUsers[jid].quotaLeft = (groupUsers[jid].quotaLeft ?? 0) + amount;
        results.push(`• ${mention62(jid)} — ✅ ditambah *+${amount}* (sisa: *${groupUsers[jid].quotaLeft}*)`);
      } else {
        const before = groupUsers[jid].quotaLeft ?? 0;
        const after = Math.max(0, before - amount);
        groupUsers[jid].quotaLeft = after;
        results.push(`• ${mention62(jid)} — ✅ dikurangi *-${amount}* (sisa: *${after}*)`);
      }
    }

    saveRegs(db);

    const title = type === 'add' ? '🔧 PENAMBAHAN LIMIT' : '🧯 PENGURANGAN LIMIT';
    const txt = [title, '━━━━━━━━━━━━━━', ...results].join('\n');

    await sock.sendMessage(chatId, { text: txt, mentions: toMention }, { quoted: message });
  } catch (e) {
    console.error('Error limitAdjustCommand:', e);
    await sock.sendMessage(chatId, { text: '❌ Gagal mengubah limit.' }, { quoted: message });
  }
}

async function limitAddCommand(sock, chatId, message) {
  return limitAdjustCommand(sock, chatId, message, 'add');
}
async function limitDelCommand(sock, chatId, message) {
  return limitAdjustCommand(sock, chatId, message, 'del');
}

// Tampilkan semua user & limit di grup ini
async function limitAllCommand(sock, chatId, message) {
  try {
    const senderJid = message?.key?.participant || message?.key?.remoteJid;

    // Boleh dibatasi admin/sudo/owner
    const sudo = await Promise.resolve(isSudo?.(senderJid));
    let adminOk = false;
    try {
      const st = await isAdmin(sock, chatId, senderJid, message);
      adminOk = !!st?.isSenderAdmin;
    } catch {}
    if (!sudo && !message?.key?.fromMe && !adminOk) {
      await sock.sendMessage(chatId, { text: '🔒 Perintah ini hanya untuk Owner/Sudo/Admin.' }, { quoted: message });
      return;
    }

    const db = loadRegs();
    const groupUsers = ensureGroup(db, chatId);
    const jids = Object.keys(groupUsers);

    if (!jids.length) {
      await sock.sendMessage(chatId, { text: '📂 Belum ada user terdaftar di grup ini.' }, { quoted: message });
      return;
    }

    const rows = [];
    rows.push('📋 *LIMIT SEMUA MEMBER (Grup Ini)*');
    rows.push('━━━━━━━━━━━━━━━━━━━━━━');
    jids.forEach((jid, i) => {
      maybeReset(groupUsers[jid]);
      const sisa = groupUsers[jid].quotaLeft ?? 0;
      const leftTime = formatDuration(timeUntilReset(chatId, jid));
      rows.push(`${i + 1}. ${mention62(jid)} — sisa: *${sisa}* / ${LIMIT_PER_WINDOW} (reset: ${leftTime})`);
    });

    // persist setelah possible reset massal
    saveRegs(db);

    await sock.sendMessage(chatId, { text: rows.join('\n'), mentions: jids }, { quoted: message });
  } catch (e) {
    console.error('Error .limitall:', e);
    await sock.sendMessage(chatId, { text: '❌ Gagal menampilkan limit semua member.' }, { quoted: message });
  }
}

/* ====== Router (opsional) ====== */
async function daftarRouter(sock, chatId, message, rawTextLower) {
  const cmd = (rawTextLower || '').split(/\s+/)[0];
  if (cmd === '.daftar') return daftarCommand(sock, chatId, message);
  if (cmd === '.limit') return limitCommand(sock, chatId, message);
  if (cmd === '.reglist') return reglistCommand(sock, chatId, message);
  if (cmd === '.regdel') {
    const idx = (rawTextLower || '').split(/\s+/)[1];
    return regdelCommand(sock, chatId, message, idx);
  }
  if (cmd === '.limitadd') return limitAddCommand(sock, chatId, message);
  if (cmd === '.limitdel') return limitDelCommand(sock, chatId, message);
  if (cmd === '.limitall') return limitAllCommand(sock, chatId, message);
}

module.exports = {
  // public
  daftarCommand,
  limitCommand,

  // admin/owner/sudo only
  reglistCommand,
  regdelCommand,
  limitAddCommand,
  limitDelCommand,
  limitAllCommand,

  // router optional
  daftarRouter,

  // helper utk gate (PER-GROUP)
  isMemberRegistered,
  getRemainingQuota,
  consumeQuota,
  timeUntilReset,
  formatDuration,
};
