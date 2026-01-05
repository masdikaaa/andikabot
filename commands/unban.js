// commands/unban.js — unban fitur user + unban chat user (per-JID)
'use strict';

const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');

const DATA_DIR = path.join(__dirname, '../data');
const USER_BAN_FILE = path.join(DATA_DIR, 'banned.json');
const CHAT_BAN_USER_FILE = path.join(DATA_DIR, 'banned_chat_users.json');

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

function unbanGuideText(prefix = '.') {
  return [
    '╭─〔 ✅ *PANDUAN UNBAN USER* 〕',
    `│ Perintah: *${prefix}unban*`,
    '│',
    `│ 1⃣ Unban fitur bot (bisa pakai fitur lagi)`,
    `│    • Reply/mention user lalu ketik:`,
    `│      *${prefix}unban fitur*`,
    '│',
    `│ 2⃣ Unban chat (chat kembali normal)`,
    `│    • Reply/mention user lalu ketik:`,
    `│      *${prefix}unban chat*`,
    '│',
    '│ Catatan:',
    '│ • Wajib reply ke pesan user *atau* mention user-nya.',
    '╰────────────────────'
  ].join('\n');
}

/**
 * .unban fitur (reply/mention) → buka ban fitur
 * .unban chat  (reply/mention) → buka ban chat
 */
async function unbanCommand(sock, chatId, message, argsStr = '') {
  try {
    const args = (argsStr || '').trim().split(/\s+/).filter(Boolean);
    const modeRaw = (args[0] || '').toLowerCase();
    const mode = modeRaw || 'fitur'; // default: fitur

    let target;
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx?.mentionedJid?.length > 0) {
      target = ctx.mentionedJid[0];
    } else if (ctx?.participant) {
      target = ctx.participant;
    }

    // Kalau tidak ada target dan cuma ngetik .unban / .unban help → kirim panduan
    if (!target && (!modeRaw || modeRaw === 'fitur' || modeRaw === 'chat' || modeRaw === 'help')) {
      await sock.sendMessage(
        chatId,
        { text: unbanGuideText('.'), ...channelInfo },
        { quoted: message }
      );
      return;
    }

    // Kalau tetap tidak ada target (argumen aneh) → error singkat + guide
    if (!target) {
      const txt = [
        '⚠️ *Target user tidak ditemukan.*',
        '',
        unbanGuideText('.')
      ].join('\n\n');
      await sock.sendMessage(chatId, { text: txt, ...channelInfo }, { quoted: message });
      return;
    }

    const username = `@${target.split('@')[0]}`;

    // ================= UNBAN CHAT =================
    if (mode === 'chat') {
      const list = ensureJsonArray(CHAT_BAN_USER_FILE);
      const idx = list.indexOf(target);
      if (idx === -1) {
        await sock.sendMessage(
          chatId,
          {
            text: `ℹ️ ${username} *tidak ada* di daftar ban chat.`,
            mentions: [target],
            ...channelInfo
          },
          { quoted: message }
        );
        return;
      }
      list.splice(idx, 1);
      saveJsonArray(CHAT_BAN_USER_FILE, list);

      const caption =
`╭──────────────────────────
│ ✅ *UNBAN CHAT BERHASIL*
│ 👤 ${username}
│ 🔓 Status : *Chat normal kembali*
╰──────────────────────────`;
      await sock.sendMessage(
        chatId,
        { text: caption, mentions: [target], ...channelInfo },
        { quoted: message }
      );
      return;
    }

    // ================= UNBAN FITUR (default) =================
    const bannedUsers = ensureJsonArray(USER_BAN_FILE);
    const idx = bannedUsers.indexOf(target);
    if (idx === -1) {
      await sock.sendMessage(
        chatId,
        {
          text: `ℹ️ ${username} *tidak ada* di daftar ban fitur.`,
          mentions: [target],
          ...channelInfo
        },
        { quoted: message }
      );
      return;
    }

    bannedUsers.splice(idx, 1);
    saveJsonArray(USER_BAN_FILE, bannedUsers);

    const caption =
`╭──────────────────────────
│ ✅ *UNBAN FITUR BERHASIL*
│ 👤 ${username}
│ 🔓 Status : *Bisa pakai fitur bot lagi*
╰──────────────────────────`;
    await sock.sendMessage(
      chatId,
      { text: caption, mentions: [target], ...channelInfo },
      { quoted: message }
    );
  } catch (err) {
    console.error('❌ Error di perintah unban:', err);
    await sock.sendMessage(
      chatId,
      {
        text: '❌ *Gagal memproses perintah unban!*',
        ...channelInfo
      },
      { quoted: message }
    );
  }
}

module.exports = unbanCommand;
