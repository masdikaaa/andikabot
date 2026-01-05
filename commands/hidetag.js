'use strict';

const isAdmin = require('../lib/isAdmin');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

/**
 * ==============================
 * Util: File & Path
 * ==============================
 */
function ensureTempDir() {
  const dir = path.join(__dirname, '../temp/');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extFromFileName(name = '') {
  const m = String(name).match(/\.([a-zA-Z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : null;
}

function extFromMime(mime = '') {
  mime = String(mime || '').toLowerCase();

  const map = {
    // image
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',

    // video
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',

    // audio
    'audio/ogg; codecs=opus': 'ogg',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',

    // docs
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',

    // text
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',

    // archive/binary
    'application/zip': 'zip',
    'application/x-7z-compressed': '7z',
    'application/x-rar-compressed': 'rar',
    'application/vnd.android.package-archive': 'apk',
    'application/x-msdownload': 'exe',
    'application/octet-stream': 'bin'
  };

  if (map[mime]) return map[mime];
  if (mime.startsWith('image/')) return mime.split('/')[1];
  if (mime.startsWith('video/')) return mime.split('/')[1];
  if (mime.startsWith('audio/')) return mime.split('/')[1];
  return null;
}

function resolveExt({ fileName, mimetype, fallback }) {
  return extFromFileName(fileName) || extFromMime(mimetype) || fallback || 'bin';
}

function extFromFilePath(fp = '') {
  const m = String(fp).match(/\.([a-zA-Z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * ==============================
 * Util: Message unwrap & mentions
 * ==============================
 */
function unwrapMessage(msg) {
  if (!msg) return msg;
  if (msg.ephemeralMessage) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.viewOnceMessageV2) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.viewOnceMessage) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.documentWithCaptionMessage) return unwrapMessage(msg.documentWithCaptionMessage.message);
  if (msg.buttonsMessage) return unwrapMessage(msg.buttonsMessage);
  if (msg.templateMessage) return unwrapMessage(msg.templateMessage);
  return msg;
}

function applyMentions(base = {}, jids = []) {
  const ctx = Object.assign({}, base.contextInfo || {});
  const merged = Array.from(new Set([...(ctx.mentionedJid || []), ...jids]));
  return {
    ...base,
    mentions: merged,
    contextInfo: { ...ctx, mentionedJid: merged }
  };
}

/**
 * ==============================
 * Downloader media generik
 * ==============================
 */
async function downloadMediaGeneric(innerMsg) {
  const candidates = [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['documentMessage', 'document'],
    ['audioMessage', 'audio'],
    ['stickerMessage', 'sticker']
  ];

  for (const [key, type] of candidates) {
    if (innerMsg?.[key]) {
      const mediaMsg = innerMsg[key];
      const stream = await downloadContentFromMessage(mediaMsg, type);

      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      const dir = ensureTempDir();
      const fileName = mediaMsg.fileName || undefined;
      const mimetype = mediaMsg.mimetype || undefined;
      const isPtt = Boolean(mediaMsg.ptt);

      const ext = resolveExt({
        fileName,
        mimetype,
        fallback:
          type === 'image' ? 'jpg'
            : type === 'video' ? 'mp4'
              : type === 'audio' ? (isPtt ? 'ogg' : 'mp3')
                : type === 'sticker' ? 'webp'
                  : 'bin'
      });

      const filePath = path.join(
        dir,
        `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      );

      fs.writeFileSync(filePath, buffer);

      const caption =
        mediaMsg.caption ||
        innerMsg?.extendedTextMessage?.text ||
        innerMsg?.conversation ||
        '';

      return { type, filePath, caption, fileName, mimetype, isPtt };
    }
  }

  return null;
}

/**
 * ==============================
 * Builder konten dari pesan apapun
 * ==============================
 */
async function buildContentFromAnyMessage(source, messageText, mentionsAll) {
  const root = source?.message ? unwrapMessage(source.message) : unwrapMessage(source);

  // 1) media pada pesan saat ini
  let media = await downloadMediaGeneric(root);
  if (media) {
    const base = applyMentions({}, mentionsAll);
    const cap = (messageText || media.caption || '').trim();

    if (media.type === 'image') {
      return { ...base, image: { url: media.filePath }, caption: cap, __tempFile: media.filePath };
    }

    if (media.type === 'video') {
      return { ...base, video: { url: media.filePath }, caption: cap, __tempFile: media.filePath };
    }

    if (media.type === 'document') {
      return {
        ...base,
        document: { url: media.filePath },
        fileName: media.fileName || `file.${extFromFilePath(media.filePath) || 'bin'}`,
        mimetype: media.mimetype,
        caption: cap,
        __tempFile: media.filePath
      };
    }

    if (media.type === 'audio') {
      const audioMime = media.mimetype || (media.isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg');
      return {
        ...base,
        audio: { url: media.filePath, mimetype: audioMime },
        ptt: media.isPtt || false,
        __tempFile: media.filePath
      };
    }

    if (media.type === 'sticker') {
      return { ...base, sticker: { url: media.filePath }, __tempFile: media.filePath };
    }
  }

  // 2) media dari quoted
  const quoted =
    root?.extendedTextMessage?.contextInfo?.quotedMessage ||
    root?.imageMessage?.contextInfo?.quotedMessage ||
    root?.videoMessage?.contextInfo?.quotedMessage ||
    root?.documentMessage?.contextInfo?.quotedMessage ||
    root?.audioMessage?.contextInfo?.quotedMessage ||
    root?.stickerMessage?.contextInfo?.quotedMessage;

  if (quoted) {
    const qInner = unwrapMessage(quoted);
    media = await downloadMediaGeneric(qInner);

    if (media) {
      const base = applyMentions({}, mentionsAll);
      const cap = (messageText || media.caption || '').trim();

      if (media.type === 'image') {
        return { ...base, image: { url: media.filePath }, caption: cap, __tempFile: media.filePath };
      }

      if (media.type === 'video') {
        return { ...base, video: { url: media.filePath }, caption: cap, __tempFile: media.filePath };
      }

      if (media.type === 'document') {
        return {
          ...base,
          document: { url: media.filePath },
          fileName: media.fileName || `file.${extFromFilePath(media.filePath) || 'bin'}`,
          mimetype: media.mimetype,
          caption: cap,
          __tempFile: media.filePath
        };
      }

      if (media.type === 'audio') {
        const audioMime = media.mimetype || (media.isPtt ? 'audio/ogg; codecs=opus' : 'audio/mpeg');
        return {
          ...base,
          audio: { url: media.filePath, mimetype: audioMime },
          ptt: media.isPtt || false,
          __tempFile: media.filePath
        };
      }

      if (media.type === 'sticker') {
        return { ...base, sticker: { url: media.filePath }, __tempFile: media.filePath };
      }
    }
  }

  // 3) kontak
  if (root?.contactMessage) {
    return applyMentions(
      {
        contacts: {
          displayName: root.contactMessage.displayName || 'Kontak',
          contacts: [{ vcard: root.contactMessage.vcard }]
        }
      },
      mentionsAll
    );
  }

  if (root?.contactsArrayMessage) {
    return applyMentions(
      {
        contacts: {
          displayName: root.contactsArrayMessage.displayName || 'Kontak',
          contacts: (root.contactsArrayMessage.contacts || []).map((c) => ({ vcard: c.vcard }))
        }
      },
      mentionsAll
    );
  }

  // 4) lokasi
  if (root?.locationMessage) {
    const loc = root.locationMessage;
    return applyMentions(
      {
        location: {
          degreesLatitude: loc.degreesLatitude,
          degreesLongitude: loc.degreesLongitude,
          name: loc.name,
          address: loc.address
        }
      },
      mentionsAll
    );
  }

  if (root?.liveLocationMessage) {
    const loc = root.liveLocationMessage;
    return applyMentions(
      {
        location: {
          degreesLatitude: loc.degreesLatitude,
          degreesLongitude: loc.degreesLongitude
        }
      },
      mentionsAll
    );
  }

  // 5) teks
  if (root?.conversation) {
    return applyMentions({ text: (messageText || root.conversation).trim() }, mentionsAll);
  }

  if (root?.extendedTextMessage?.text) {
    return applyMentions({ text: (messageText || root.extendedTextMessage.text).trim() }, mentionsAll);
  }

  return null;
}

/**
 * ==============================
 * Helper: strip command di depan
 * ==============================
 */
function stripCmd(cmd, s = '') {
  const r = new RegExp(`^\\s*\\.${cmd}\\b`, 'i');
  return String(s || '').replace(r, '').trim();
}

/**
 * ==============================
 * Command: .hidetag (single message, mention semua)
 * ==============================
 */
async function hideTagCommand(sock, chatId, senderId, messageText, replyMessage, message) {
  const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

  if (!isBotAdmin) {
    await sock.sendMessage(
      chatId,
      {
        text:
          '⚠️ *Bot belum menjadi admin!*\n' +
          'Silakan jadikan bot sebagai admin terlebih dahulu agar dapat menggunakan perintah ini.'
      },
      { quoted: message }
    );
    return;
  }

  if (!isSenderAdmin) {
    await sock.sendMessage(
      chatId,
      { text: '🚫 *Perintah ini hanya bisa digunakan oleh admin grup!*' },
      { quoted: message }
    );
    return;
  }

  // Ambil SEMUA anggota (admin + non-admin)
  const groupMetadata = await sock.groupMetadata(chatId);
  const participants = groupMetadata.participants || [];
  const allMembers = participants.map((p) => p.id);

  // Bersihkan teks komando: ".hidetag ..." -> sisa argumen saja
  const cleanedText = stripCmd('hidetag', messageText || '');
  const hasUserText = cleanedText.length > 0;

  let content = null;

  if (hasUserText) {
    // User kasih teks setelah .hidetag → kirim teks/teks+media sesuai konteks sekarang
    content = await buildContentFromAnyMessage(message, cleanedText, allMembers);
    if (!content && replyMessage) {
      content = await buildContentFromAnyMessage({ message: replyMessage }, cleanedText, allMembers);
    }
  } else if (replyMessage) {
    // Tanpa argumen, tapi reply media/teks → pakai konten reply
    content = await buildContentFromAnyMessage({ message: replyMessage }, '', allMembers);
  }

  // Fallback terakhir: teks default
  if (!content) {
    content = applyMentions({ text: '👥 Menandai semua anggota grup ini.' }, allMembers);
  }

  // Simpan path temp (kalau ada) lalu hapus setelah kirim
  const tempFile = content.__tempFile;
  if ('__tempFile' in content) delete content.__tempFile;

  try {
    // Kirim SATU pesan (WhatsApp auto-handle mention list)
    await sock.sendMessage(chatId, content, { quoted: message });
  } catch (err) {
    // Gagal media → kirim teks saja
    const fallbackText = hasUserText ? cleanedText : '👥 Menandai semua anggota grup ini.';
    await sock.sendMessage(
      chatId,
      applyMentions({ text: fallbackText }, allMembers),
      { quoted: message }
    );
  } finally {
    if (tempFile && fs.existsSync(tempFile)) fs.unlink(tempFile, () => {});
  }
}

module.exports = hideTagCommand;
