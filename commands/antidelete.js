// commands/antidelete.js
const fs = require('fs');
const path = require('path');
const { writeFile } = require('fs/promises');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const isOwner = require('../lib/isOwner');
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

const messageStore = new Map();

const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');
if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

function loadAntideleteConfig () {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { enabled: false };
  }
}
function saveAntideleteConfig (config) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch {}
}

// helper: stream -> Buffer
async function streamToBuffer (stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

// helper: cek apakah JID punya hak istimewa
async function isPrivilegedDeleter (sock, jid, groupJid) {
  try {
    // Owner atau Sudo?
    if (await isOwner(jid)) return true;
    if (typeof isSudo === 'function' && await isSudo(jid)) return true;

    // Admin grup?
    if (groupJid && groupJid.endsWith('@g.us')) {
      const { isSenderAdmin } = await isAdmin(sock, groupJid, jid);
      if (isSenderAdmin) return true;
    }
  } catch {}
  return false;
}

async function handleAntideleteCommand (sock, chatId, message, match) {
  const senderJid = message.key.participant || message.key.remoteJid;
  const allowed = await isOwner(senderJid) || (typeof isSudo === 'function' && await isSudo(senderJid));
  if (!allowed) {
    return sock.sendMessage(chatId, { text: '⛔ *Hanya owner atau sudo yang bisa menggunakan perintah ini.*' }, { quoted: message });
  }

  const config = loadAntideleteConfig();
  if (!match) {
    await sock.sendMessage(
      chatId,
      { text: `*🔰 PENGATURAN ANTIDELETE 🔰*\n\nStatus: ${config.enabled ? '✅ Aktif' : '❌ Nonaktif'}\n\n.antidelete on  → Aktifkan\n.antidelete off → Nonaktifkan` },
      { quoted: message }
    );
    return;
  }

  if (match === 'on') config.enabled = true;
  else if (match === 'off') config.enabled = false;
  else {
    return sock.sendMessage(chatId, { text: '⚠️ Format salah. Gunakan: *.antidelete on* atau *.antidelete off*' }, { quoted: message });
  }

  saveAntideleteConfig(config);
  await sock.sendMessage(chatId, { text: `✅ Antidelete ${config.enabled ? 'diaktifkan' : 'dinonaktifkan'}.` }, { quoted: message });
}

async function storeMessage (sock, message) {
  try {
    const config = loadAntideleteConfig();
    if (!config.enabled || !message.key?.id) return;

    const id = message.key.id;
    const groupJid = message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null;
    const sender = message.key.participant || message.key.remoteJid;

    let content = '';
    let mediaType = '';
    let mediaPath = '';

    // teks
    if (message.message?.conversation) content = message.message.conversation;
    else if (message.message?.extendedTextMessage?.text) content = message.message.extendedTextMessage.text;

    // gambar
    if (message.message?.imageMessage) {
      mediaType = 'image';
      content = message.message.imageMessage.caption || content;
      const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
      const buf = await streamToBuffer(stream);
      mediaPath = path.join(TEMP_MEDIA_DIR, `${id}.jpg`);
      await writeFile(mediaPath, buf);

    // stiker
    } else if (message.message?.stickerMessage) {
      mediaType = 'sticker';
      const stream = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
      const buf = await streamToBuffer(stream);
      mediaPath = path.join(TEMP_MEDIA_DIR, `${id}.webp`);
      await writeFile(mediaPath, buf);

    // video
    } else if (message.message?.videoMessage) {
      mediaType = 'video';
      content = message.message.videoMessage.caption || content;
      const stream = await downloadContentFromMessage(message.message.videoMessage, 'video');
      const buf = await streamToBuffer(stream);
      mediaPath = path.join(TEMP_MEDIA_DIR, `${id}.mp4`);
      await writeFile(mediaPath, buf);

    // audio
    } else if (message.message?.audioMessage) {
      mediaType = 'audio';
      const mime = message.message.audioMessage.mimetype || '';
      const ext = mime.includes('ogg') ? 'ogg' : (mime.includes('mp4') || mime.includes('m4a')) ? 'm4a' : 'mp3';
      const stream = await downloadContentFromMessage(message.message.audioMessage, 'audio');
      const buf = await streamToBuffer(stream);
      mediaPath = path.join(TEMP_MEDIA_DIR, `${id}.${ext}`);
      await writeFile(mediaPath, buf);
    }

    messageStore.set(id, {
      sender,
      group: groupJid,
      content,
      mediaType,
      mediaPath,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('storeMessage error:', err);
  }
}

async function handleMessageRevocation (sock, revocationMessage) {
  try {
    const config = loadAntideleteConfig();
    if (!config.enabled) return;

    const key = revocationMessage.message?.protocolMessage?.key;
    if (!key?.id) return;

    const deletedBy =
      revocationMessage.participant ||
      revocationMessage.key?.participant ||
      revocationMessage.key?.remoteJid;

    const original = messageStore.get(key.id);
    if (!original) return;

    // ⛔ KECUALIKAN jika deleter = owner/sudo/admin grup
    const privileged = await isPrivilegedDeleter(sock, deletedBy, original.group);
    if (privileged) {
      // tetap bersihin cache file bila ada
      if (original.mediaPath && fs.existsSync(original.mediaPath)) {
        try { fs.unlinkSync(original.mediaPath); } catch {}
      }
      messageStore.delete(key.id);
      return;
    }

    const sender = original.sender;
    const groupName = original.group ? (await sock.groupMetadata(original.group)).subject : '';

    let text =
      `*📒 LAPORAN ANTIDELETE*\n\n` +
      `🗑️ *Dihapus oleh:* @${(deletedBy || '').split('@')[0]}\n` +
      `👤 *Pengirim:* @${(sender || '').split('@')[0]}\n` +
      `📱 *Nomor:* ${sender}\n`;
    if (groupName) text += `👥 *Grup:* ${groupName}\n`;
    if (original.content) text += `\n💬 *Pesan yang dihapus:*\n${original.content}`;

    const target = original.group || deletedBy;
    await sock.sendMessage(target, { text, mentions: [deletedBy, sender] });

    if (original.mediaType && fs.existsSync(original.mediaPath)) {
      try {
        if (original.mediaType === 'image')      await sock.sendMessage(target, { image: { url: original.mediaPath } });
        else if (original.mediaType === 'sticker') await sock.sendMessage(target, { sticker: { url: original.mediaPath } });
        else if (original.mediaType === 'video')   await sock.sendMessage(target, { video: { url: original.mediaPath } });
        else if (original.mediaType === 'audio')   await sock.sendMessage(target, { audio: { url: original.mediaPath }, mimetype: 'audio/mpeg' });
      } catch (e) {
        console.error('Kirim media error:', e);
      }
      try { fs.unlinkSync(original.mediaPath); } catch {}
    }

    messageStore.delete(key.id);
  } catch (err) {
    console.error('handleMessageRevocation error:', err);
  }
}

module.exports = {
  handleAntideleteCommand,
  handleMessageRevocation,
  storeMessage
};
