// commands/ban.js — ban fitur user + ban chat user (per-JID)
'use strict';

const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');

// Lokasi file data
const DATA_DIR = path.join(__dirname, '../data');
const USER_BAN_FILE = path.join(DATA_DIR, 'banned.json');                // untuk ban fitur (dipakai isBanned)
const CHAT_BAN_USER_FILE = path.join(DATA_DIR, 'banned_chat_users.json'); // untuk ban chat per user

// Helper umum
function ensureJsonArray(filePath, defaultValue = '[]') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultValue);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonArray(filePath, arr) {
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

function banGuideText(prefix = '.') {
  return [
    '╭─〔 🚫 *PANDUAN BAN USER* 〕',
    `│ Perintah: *${prefix}ban*`,
    '│',
    `│ 1⃣ Ban fitur bot (user tidak bisa pakai fitur)`,
    `│    • Reply/mention user lalu ketik:`,
    `│      *${prefix}ban fitur*`,
    '│',
    `│ 2⃣ Ban chat (pesan user akan dicoba dihapus + bot diam)`,
    `│    • Reply/mention user lalu ketik:`,
    `│      *${prefix}ban chat*`,
    '│',
    `│ 3⃣ Buka ban (pakai perintah *unban*):`,
    `│    • *${prefix}unban fitur*  (reply/mention)`,
    `│    • *${prefix}unban chat*   (reply/mention)`,
    '│',
    '│ Catatan:',
    '│ • Wajib reply ke pesan user *atau* mention user-nya.',
    '╰────────────────────'
  ].join('\n');
}

/**
 * .ban fitur (reply/mention) → ban fitur bot untuk user
 * .ban chat  (reply/mention) → ban chat (pesan user auto-delete)
 */
async function banCommand(sock, chatId, message, argsStr = '') {
  try {
    const args = (argsStr || '').trim().split(/\s+/).filter(Boolean);
    const modeRaw = (args[0] || '').toLowerCase();
    const mode = modeRaw || 'fitur'; // default: fitur

    // Tentukan target user (reply / mention)
    let userToBan;
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.mentionedJid?.length > 0) {
      userToBan = ctx.mentionedJid[0];
    } else if (ctx?.participant) {
      userToBan = ctx.participant;
    }

    // Kalau tidak ada target DAN tidak jelas mau ban siapa → kirim panduan
    if (!userToBan && (!modeRaw || modeRaw === 'fitur' || modeRaw === 'chat' || modeRaw === 'help')) {
      await sock.sendMessage(
        chatId,
        { text: banGuideText('.'), ...channelInfo },
        { quoted: message }
      );
      return;
    }

    // Kalau tetap tidak ada target (misal argumen aneh) → error singkat + guide
    if (!userToBan) {
      const txt = [
        '⚠️ *Target user tidak ditemukan.*',
        '',
        banGuideText('.')
      ].join('\n\n');
      await sock.sendMessage(chatId, { text: txt, ...channelInfo }, { quoted: message });
      return;
    }

    const username = `@${userToBan.split('@')[0]}`;

    // ================== MODE: BAN CHAT (auto-delete pesan user itu) ==================
    if (mode === 'chat') {
      const list = ensureJsonArray(CHAT_BAN_USER_FILE);
      if (!list.includes(userToBan)) {
        list.push(userToBan);
        saveJsonArray(CHAT_BAN_USER_FILE, list);

        const caption =
`╭──────────────────────────
│ 🚫 *USER DIBANNED CHAT!*
│ 👤 ${username}
│ 🧹 Aksi : *Pesan user akan dicoba dihapus otomatis*
│ 🤫 Bot tidak akan merespon pesan user ini.
╰──────────────────────────`;
        await sock.sendMessage(
          chatId,
          { text: caption, mentions: [userToBan], ...channelInfo },
          { quoted: message }
        );
      } else {
        await sock.sendMessage(
          chatId,
          {
            text: `ℹ️ ${username} sudah ada di daftar *ban chat*.`,
            mentions: [userToBan],
            ...channelInfo
          },
          { quoted: message }
        );
      }
      return;
    }

    // ================== MODE: BAN FITUR (default) ==================
    const bannedUsers = ensureJsonArray(USER_BAN_FILE);

    if (!bannedUsers.includes(userToBan)) {
      bannedUsers.push(userToBan);
      saveJsonArray(USER_BAN_FILE, bannedUsers);

      const caption =
`╭──────────────────────────
│ 🚫 *USER DIBANNED FITUR!*
│ 👤 ${username}
│ 🔒 Status : *Dilarang memakai fitur bot*
╰──────────────────────────`;
      await sock.sendMessage(
        chatId,
        { text: caption, mentions: [userToBan], ...channelInfo },
        { quoted: message }
      );
    } else {
      await sock.sendMessage(
        chatId,
        {
          text: `ℹ️ ${username} sudah ada di daftar *ban fitur*.`,
          mentions: [userToBan],
          ...channelInfo
        },
        { quoted: message }
      );
    }
  } catch (error) {
    console.error('❌ Error di perintah ban:', error);
    await sock.sendMessage(
      chatId,
      {
        text:
          '❌ *Gagal memproses perintah ban!*\n' +
          'Coba ulangi lagi atau cek file data.',
        ...channelInfo
      },
      { quoted: message }
    );
  }
}

module.exports = banCommand;
