// commands/antisticker.js — admin-only, Baileys v7 safe, kompatibel main.js
'use strict';

const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');
const {
  getAntiStickerConfig,
  setAntiStickerConfig
} = require('../lib/antisticker');

const WARN_LIMIT = 3;

// utils
function toInt(v, def) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n >= 0) ? n : def; // terima 0
}
function isAction(v) {
  return ['delete', 'warn', 'kick'].includes(String(v || '').toLowerCase());
}
function fmtStatus(cfg) {
  const status = cfg.enabled ? '✅ Aktif' : '🟡 Nonaktif';
  const actIcon = cfg.action === 'kick' ? '👢 Kick' : (cfg.action === 'warn' ? '⚠️ Warn' : '🗑 Hapus');

  const limitLine = (cfg.limit === 0)
    ? '┊ Limit  : *0* stiker (SEMUA stiker akan ditindak)'
    : `┊ Limit  : *${cfg.limit}* stiker (mulai stiker ke-${cfg.limit + 1} akan ditindak)`;

  const note = (cfg.action === 'warn')
    ? `\n┊ 📌 *Catatan:* Peringatan ke *${WARN_LIMIT}* akan di-*kick* otomatis.`
    : '';

  return [
    '┏━〔 ⚙️ *AntiSticker* 〕━┓',
    `┊ Status : *${status}*`,
    limitLine,
    `┊ Aksi   : *${cfg.action}* ${actIcon}`,
    note,
    '┗━━━━━━━━━━━━━━━━━━━━━━┛'
  ].filter(Boolean).join('\n');
}

/**
 * Dipanggil dari main.js:
 * antiStickerCommand(sock, chatId, userMessage, senderId, isSenderAdminFromMain, message)
 */
async function antiStickerCommand(sock, chatId, userMessage, senderId, isSenderAdminFromMain, message) {
  try {
    const isGroup = String(chatId || '').endsWith('@g.us');
    if (!isGroup) {
      await sock.sendMessage(chatId, { text: '❌ Perintah ini hanya dapat dipakai di *grup*.' }, { quoted: message });
      return;
    }

    // Pastikan bot admin (double-check, walau sudah dicek di main.js)
    let chk = { isSenderAdmin: !!isSenderAdminFromMain, isBotAdmin: false };
    try { chk = await isAdmin(sock, chatId, senderId); } catch {}
    const isBotAdmin = !!chk.isBotAdmin;

    if (!isBotAdmin) {
      await sock.sendMessage(chatId, { text: '❌ *Jadikan bot sebagai admin* terlebih dahulu.' }, { quoted: message });
      return;
    }

    // Guard: khusus admin / owner / sudo
    const fromMe = !!(message?.key?.fromMe);
    const senderIsSudo = await isSudo(senderId).catch(() => false);
    const isSenderAdmin = !!isSenderAdminFromMain || !!chk.isSenderAdmin || fromMe || senderIsSudo;

    if (!isSenderAdmin) {
      await sock.sendMessage(chatId, { text: '🚫 *Khusus Admin Grup!*' }, { quoted: message });
      return;
    }

    // Ambil teks mentah
    const raw = (
      message?.message?.conversation ||
      message?.message?.extendedTextMessage?.text ||
      message?.message?.imageMessage?.caption ||
      message?.message?.videoMessage?.caption ||
      userMessage || ''
    ).trim();

    // Parse subcommand
    const head = raw.split(/\s+/)[0] || '';
    const argsStr = raw.slice(head.length).trim();
    const parts = (argsStr || '').split(/\s+/).filter(Boolean);
    const sub = (parts[0] || '').toLowerCase();
    const a1  = parts[1];
    const a2  = parts[2];

    // Konfigurasi saat ini
    const current = getAntiStickerConfig(chatId); // { enabled, limit, action }

    // Tanpa subcommand => bantuan + status
    if (!sub) {
      const help = [
        '🧱 *AntiSticker* — batas stiker per user dengan cooldown 60s',
        '',
        '• Hidupkan:',
        '  `.antisticker on [limit] [aksi]`',
        '   - limit: angka >=0 (0 = semua stiker ditindak, default 2)',
        '   - aksi : delete | warn | kick (default delete)',
        '• Matikan:',
        '  `.antisticker off`',
        '• Ubah konfigurasi:',
        '  `.antisticker set <limit>=0..n [aksi]`',
        '• Lihat status:',
        '  `.antisticker get`',
        '',
        fmtStatus(current)
      ].join('\n');

      await sock.sendMessage(chatId, { text: help }, { quoted: message });
      return;
    }

    // GET
    if (sub === 'get') {
      await sock.sendMessage(chatId, { text: fmtStatus(current) }, { quoted: message });
      return;
    }

    // OFF
    if (sub === 'off') {
      const next = setAntiStickerConfig(chatId, { enabled: false, limit: current.limit, action: current.action });
      await sock.sendMessage(
        chatId,
        { text: ['✅ *AntiSticker dimatikan.*', '', fmtStatus(next)].join('\n') },
        { quoted: message }
      );
      return;
    }

    // ON
    if (sub === 'on') {
      const curLim = Number.isFinite(current.limit) ? current.limit : 2;

      // .antisticker on [limit] [aksi]
      const limitArg  = (a1 !== undefined) ? toInt(a1, curLim) : curLim;
      const actionArg = isAction(a2) ? a2.toLowerCase()
                        : (isAction(a1) ? a1.toLowerCase()
                        : (current.action || 'delete'));

      const next = setAntiStickerConfig(chatId, { enabled: true, limit: limitArg, action: actionArg });
      const lines = [
        '✅ *AntiSticker diaktifkan.*',
        '',
        fmtStatus(next)
      ];
      if (next.action === 'warn') {
        lines.push('');
        lines.push(`⚠️ *Peringatan penuh:* ${WARN_LIMIT} → *Auto Kick*`);
      }

      await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
      return;
    }

    // SET
    if (sub === 'set') {
      if (!a1) {
        await sock.sendMessage(chatId, { text: 'Format: `.antisticker set <limit>=0..n [delete|warn|kick]`' }, { quoted: message });
        return;
      }
      const curLim = Number.isFinite(current.limit) ? current.limit : 2;
      const limitArg  = toInt(a1, curLim); // sekarang bisa 0
      const actionArg = isAction(a2) ? a2.toLowerCase() : (current.action || 'delete');

      const next = setAntiStickerConfig(chatId, { enabled: true, limit: limitArg, action: actionArg });
      const lines = [
        '✅ *Konfigurasi diperbarui.*',
        '',
        fmtStatus(next)
      ];
      if (next.action === 'warn') {
        lines.push('');
        lines.push(`⚠️ *Peringatan penuh:* ${WARN_LIMIT} → *Auto Kick*`);
      }

      await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
      return;
    }

    await sock.sendMessage(chatId, { text: '❌ Subcommand tidak dikenal. Gunakan `.antisticker` untuk bantuan.' }, { quoted: message });
  } catch (err) {
    console.error('antisticker command error:', err);
    try { await sock.sendMessage(chatId, { text: '❌ Terjadi kesalahan saat memproses perintah *antisticker*.' }); } catch {}
  }
}

module.exports = { antiStickerCommand };
