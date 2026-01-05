// commands/getpp.js — Baileys v7 ready, caption tanpa JID/LID (hanya @nomor atau "grup ini")
'use strict';

const axios = require('axios');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// (opsional) badge channel info biar konsisten
let baseChannelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg && cfg.channelInfo) baseChannelInfo = cfg.channelInfo;
} catch {}
if (!baseChannelInfo.contextInfo) {
  baseChannelInfo = {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421594431163@newsletter',
        newsletterName: 'Andika Bot',
        serverMessageId: -1
      }
    }
  };
}

// de-dupe agar satu message id tidak memicu dua kali
const processedMessages = new Set();

/** Ambil angka dari JID untuk @mention */
function numberFromJid(jid = '') {
  return String(jid).replace(/@.+$/, '').replace(/^0+/, '');
}

/** Normalisasi kandidat JID */
function norm(j) {
  try { return jidNormalizedUser(j); } catch { return j || ''; }
}

/** Tentukan target JID dari mention/reply/argumen 'gc' atau fallback */
function resolveTargetJid(message, chatId, rawText) {
  const ctx1 = message?.message?.extendedTextMessage?.contextInfo
            || message?.message?.contextInfo;

  // 1) Mention
  const mentioned = ctx1?.mentionedJid;
  if (Array.isArray(mentioned) && mentioned.length) {
    return norm(mentioned[0]);
  }

  // 2) Reply (quoted participant)
  const quotedParticipant = ctx1?.participant;
  if (quotedParticipant) {
    return norm(quotedParticipant);
  }

  // 3) Arg 'gc' → ambil PP grup (hanya bila di grup)
  if (rawText) {
    const t = rawText.trim().toLowerCase();
    if (t === 'gc' || t === 'group' || t === 'grup') {
      return chatId; // kalau DM, akan ditangani oleh pemanggil
    }
  }

  // 4) Default: di grup → pengirim; di DM → remoteJid
  const sender = message?.key?.participant || message?.participant;
  const remote = message?.key?.remoteJid;
  if (sender) return norm(sender);
  if (remote) return norm(remote);
  return chatId; // fallback terakhir
}

/** Ambil URL PP, prefer 'image' lalu fallback 'preview' */
async function getProfilePicUrl(sock, jid) {
  try {
    return await sock.profilePictureUrl(jid, 'image'); // full
  } catch {
    try {
      return await sock.profilePictureUrl(jid, 'preview'); // kecil
    } catch {
      return null;
    }
  }
}

/** Unduh URL ke buffer */
async function fetchToBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  return Buffer.from(res.data);
}

/** Command utama */
async function getppCommand(sock, chatId, message) {
  // Anti-duplikat eksekusi pada message yang sama
  const msgId = message?.key?.id;
  if (msgId) {
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);
    setTimeout(() => processedMessages.delete(msgId), 3 * 60 * 1000);
  }

  try {
    // Ambil teks/argumen asli (bukan lowercased) untuk cek 'gc'
    const rawText =
      message?.message?.conversation?.trim() ||
      message?.message?.extendedTextMessage?.text?.trim() ||
      message?.message?.imageMessage?.caption?.trim() ||
      message?.message?.videoMessage?.caption?.trim() ||
      '';

    const isGroupChat = String(chatId).endsWith('@g.us');

    // Cek argumen khusus 'gc' saat bukan di grup
    if (rawText && ['gc','group','grup'].includes(rawText.trim().toLowerCase()) && !isGroupChat) {
      await sock.sendMessage(
        chatId,
        { text: '⚠️ Perintah `gc` hanya berlaku di dalam *grup*.', ...baseChannelInfo },
        { quoted: message }
      );
      return;
    }

    // Tentukan target
    const target = resolveTargetJid(message, chatId, rawText);

    // Ambil URL PP (user/grup)
    let url = await getProfilePicUrl(sock, target);

    // Kalau requested PP grup tapi gagal, coba PP dari chatId (beberapa grup private)
    if (!url && target.endsWith('@g.us') && chatId !== target) {
      url = await getProfilePicUrl(sock, chatId);
    }

    if (!url) {
      await sock.sendMessage(
        chatId,
        { text: '🙇‍♂️ Maaf, foto profil tidak tersedia (mungkin disembunyikan).', ...baseChannelInfo },
        { quoted: message }
      );
      return;
    }

    // Unduh ke buffer
    const imgBuf = await fetchToBuffer(url);

    // Susun caption tanpa JID/LID
    const isGroupTarget = String(target).endsWith('@g.us');
    const human = isGroupTarget ? 'grup ini' : `@${numberFromJid(target)}`;
    const caption =
`🖼️ Foto profil ${isGroupTarget ? 'grup' : 'pengguna'}
• Target: ${human}`;

    // Kirim gambar (mention user bila applicable)
    await sock.sendMessage(
      chatId,
      {
        image: imgBuf,
        caption,
        mentions: isGroupTarget ? [] : [target],
        ...baseChannelInfo
      },
      { quoted: message }
    );
  } catch (err) {
    // Jangan log target/url untuk menghindari bocor JID/LID
    console.error('[getpp] error:', err?.message || err);
    await sock.sendMessage(
      chatId,
      { text: `❌ Gagal mengambil foto profil.`, ...baseChannelInfo },
      { quoted: message }
    );
  }
}

module.exports = getppCommand;
