// commands/warn.js (FINAL)
// - Reply ke pesan target → +1 warn otomatis
// - REPLY > MENTION
// - Balasan bot mengutip pesan target (quoted)
// - Decrement presisi: .warn delete [-1|-2|-3] @user  /  .warn -1 @user
// - Help hanya untuk ".warn help|?|usage"

const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const lib = require('../lib/index');
const incrementWarningCount = lib.incrementWarningCount;
const resetWarningCount = lib.resetWarningCount;
const normalizeId = lib.normalizeId || ((s) => (String(s).match(/\d{7,15}/) || [null])[0] || String(s));

/* ===============================
   Polyfill getWarningCount (ambil nilai current)
================================ */
let getWarningCount = lib.getWarningCount;
if (typeof getWarningCount !== 'function') {
  const CANDIDATE_PATHS = [
    path.join(__dirname, '../data/userGroupData.json'),
    path.join(__dirname, '../data/userGroupdata.json'),
    path.join(process.cwd(), 'data/userGroupData.json'),
    path.join(process.cwd(), 'data/userGroupdata.json'),
  ];
  const readJsonSafe = (p) => {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
    } catch {}
    return null;
  };
  function tryExtractCount(store, chatId, userJid) {
    if (!store || typeof store !== 'object') return null;
    const uid = normalizeId(userJid) || String(userJid);
    // skema utama: store.warnings[chatId][uid]
    if (store.warnings && store.warnings[chatId]) {
      const v = store.warnings[chatId][uid];
      if (Number.isInteger(v) && v >= 0) return v;
      const vr = store.warnings[chatId][userJid];
      if (Number.isInteger(vr) && vr >= 0) return vr;
    }
    // variasi lama
    if (store[chatId]?.warnings && typeof store[chatId].warnings === 'object') {
      const v = store[chatId].warnings[uid];
      if (Number.isInteger(v) && v >= 0) return v;
    }
    if (store[chatId]?.warn && typeof store[chatId].warn === 'object') {
      const v = store[chatId].warn[uid];
      if (Number.isInteger(v) && v >= 0) return v;
    }
    // legacy flat
    if (store.warnings && Number.isInteger(store.warnings[uid])) return store.warnings[uid];
    return null;
  }
  getWarningCount = async function (chatId, userJid) {
    for (const p of CANDIDATE_PATHS) {
      const data = readJsonSafe(p);
      const val = tryExtractCount(data, chatId, userJid);
      if (val !== null) return val;
    }
    return 0;
  };
}

/* ===============================
   UTIL: Format & Styling
================================ */
function formatDateID(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} WIB`;
  } catch {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} WIB`;
  }
}
function bar(count, max = 3) {
  const c = Math.max(0, Math.min(count, max));
  return '▰'.repeat(c) + '▱'.repeat(max - c);
}
function box(titleEmoji, titleText, lines) {
  const head = `*┏━〔 ${titleEmoji} ${titleText} 〕━┓*`;
  const body = lines.map(l => `┊ ${l}`).join('\n');
  const foot = '*┗━━━━━━━━━━━━━━━━━━━━━━┛*';
  return [head, body, foot].join('\n');
}
function usageLines() {
  return [
    '📌 *Cara pakai .warn:*',
    '• Tambah 1 warn: `.warn` (REPLY ke pesan user) atau `.warn @user`',
    '• Kurangi default 3: `.warn delete @user`',
    '• Kurangi custom: `.warn delete -1 @user`, `.warn del -2 @user`, `.warn -3 @user`',
    '',
    'ℹ️ *Auto-kick* saat mencapai 3 warn.'
  ];
}

/* ===============================
   TEXT / TARGET / QUOTED
================================ */
function getRawText(message) {
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    ''
  );
}

// PRIORITAS: REPLY > MENTION
function resolveTargetJid(message, mentionedJids) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  if (ctx?.participant) return ctx.participant;     // reply target
  if (Array.isArray(mentionedJids) && mentionedJids.length > 0) return mentionedJids[0];
  return null;
}

// Buat quoted agar balasan bot mengutip pesan target (jika tersedia)
function buildQuotedFromContext(message, chatId) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.stanzaId || !ctx.quotedMessage) return null;
  const participant = ctx.participant || (ctx.mentionedJid && ctx.mentionedJid[0]) || null;
  return {
    key: {
      id: ctx.stanzaId,
      remoteJid: chatId,
      fromMe: false,
      participant
    },
    message: ctx.quotedMessage
  };
}

/* ===============================
   MAIN COMMAND
================================ */
async function warnCommand(sock, chatId, senderId, mentionedJids, message) {
  try {
    // Grup only
    if (!chatId.endsWith('@g.us')) {
      await sock.sendMessage(chatId, { text: box('❌', 'Bukan Grup', ['Perintah ini hanya dapat digunakan di grup.']) });
      return;
    }

    // Cek admin
    let adminInfo;
    try {
      adminInfo = await isAdmin(sock, chatId, senderId);
    } catch {
      await sock.sendMessage(chatId, { text: box('❌', 'Gagal Cek Admin', ['Pastikan bot adalah admin di grup ini.']) });
      return;
    }
    const { isSenderAdmin, isBotAdmin } = adminInfo || {};
    if (!isBotAdmin) {
      await sock.sendMessage(chatId, { text: box('❌', 'Bot Bukan Admin', ['Jadikan bot sebagai admin grup terlebih dahulu.']) });
      return;
    }
    if (!isSenderAdmin) {
      await sock.sendMessage(chatId, { text: box('❌', 'Akses Ditolak', ['Hanya admin grup yang dapat menggunakan *warn*.']) });
      return;
    }

    // Parsing
    const rawText = (getRawText(message) || '').trim();
    const lc = rawText.toLowerCase();

    // >>> Help hanya jika ada argumen help/?/usage
    if (/^\.?warn\s+(help|\?|usage)\s*$/i.test(lc)) {
      await sock.sendMessage(chatId, { text: box('📖', 'Bantuan .warn', usageLines()) });
      return;
    }

    const parts = lc.split(/\s+/);
    const arg1 = parts[1] || '';                // "delete" atau "-1"
    const arg2 = parts[2] || '';                // angka setelah "delete" (opsional)
    const isDeleteKeyword = ['delete', 'del', 'remove'].includes(arg1);
    const parsedNeg =
      /^-(\d+)$/.test(arg1) ? Number(arg1) :
      (/^-(\d+)$/.test(arg2) ? Number(arg2) : null);

    let decrement = 0;
    if (isDeleteKeyword) {
      const desired = parsedNeg !== null ? parsedNeg : -3;
      decrement = Math.min(Math.max(desired, -3), -1);
    } else if (parsedNeg !== null) {
      decrement = Math.min(Math.max(parsedNeg, -3), -1);
    }

    // Tentukan target: REPLY > MENTION
    const userTarget = resolveTargetJid(message, mentionedJids);
    if (!userTarget) {
      await sock.sendMessage(chatId, {
        text: box('❌', 'Target Tidak Ditemukan', [
          decrement
            ? 'Sebut (mention) atau *balas pesan* user untuk *mengurangi warn*!'
            : 'Sebut (mention) atau *balas pesan* user untuk memberi *warn*!',
          '', ...usageLines()
        ])
      });
      return;
    }

    // quoted agar balasan bot mengutip pesan target
    const quotedTarget = buildQuotedFromContext(message, chatId);

    // === CUSTOM DECREMENT ===
    if (decrement) {
      const current = (await getWarningCount(chatId, userTarget).catch(() => 0)) || 0;
      const dec = Math.min(Math.abs(decrement), 3);
      const targetCount = Math.max(0, current - dec);

      await resetWarningCount(chatId, userTarget);
      for (let i = 0; i < targetCount; i++) await incrementWarningCount(chatId, userTarget);

      const msg = box('🗑️', 'DELETE WARN', [
        `👤 *Pengguna :* @${(userTarget || '').split('@')[0]}`,
        `🧮 *Dikurangi :* ${Math.min(dec, current)}`,
        `📉 *Sisa Warn :* ${targetCount}/3  ${bar(targetCount)}`,
        `👑 *Oleh     :* @${(senderId || '').split('@')[0]}`,
        `🕒 *Waktu    :* ${formatDateID()}`,
      ]);

      await sock.sendMessage(
        chatId,
        { text: msg, mentions: [userTarget, senderId] },
        { quoted: quotedTarget || message }
      );
      return;
    }

    // === INCREMENT (+1) ===
    const count = await incrementWarningCount(chatId, userTarget); // lib handle normalize
    const warnMsg = box('⚠️', 'PERINGATAN', [
      `👤 *Pengguna   :* @${(userTarget || '').split('@')[0]}`,
      `🔢 *Peringatan :* ${Math.min(count, 3)}/3  ${bar(count)}`,
      `👑 *Diberi oleh:* @${(senderId || '').split('@')[0]}`,
      `🕒 *Waktu      :* ${formatDateID()}`,
    ]);

    await sock.sendMessage(
      chatId,
      { text: warnMsg, mentions: [userTarget, senderId] },
      { quoted: quotedTarget || message } // reply ke pesan target jika ada
    );

    // Auto-kick ketika ≥ 3
    if (count >= 3) {
      await new Promise(r => setTimeout(r, 380));
      try {
        await sock.groupParticipantsUpdate(chatId, [userTarget], 'remove');
      } catch (e) {
        console.error('Gagal kick auto-kick warn:', e?.message);
      }
      await resetWarningCount(chatId, userTarget);

      const kickMsg = box('🚫', 'AUTO-KICK', [
        `@${(userTarget || '').split('@')[0]} telah dikeluarkan dari grup setelah menerima 3 peringatan!`,
        `🕒 *Waktu :* ${formatDateID()}`,
      ]);

      await sock.sendMessage(chatId, { text: kickMsg, mentions: [userTarget] });
    }
  } catch (error) {
    console.error('Error in warn command:', error);
    try {
      await sock.sendMessage(chatId, { text: box('❌', 'Gagal Memproses', ['Gagal memproses perintah *warn*. Pastikan bot admin dan coba lagi.']) });
    } catch {}
  }
}

module.exports = warnCommand;
