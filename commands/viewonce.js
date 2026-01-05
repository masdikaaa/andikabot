// commands/viewonce.js — Baileys v7: mention pass-through + sender @ (aman)
'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../lib/messageConfig');

/** Toggle: tambahkan @pengirim hanya jika caption punya mention */
const ADD_SENDER_AT_WHEN_MENTION = true;

/**
 * Unwrap pesan view-once (v1/v2/v2x) + ephemeral
 * Input: contextInfo.quotedMessage
 */
function unwrapViewOnce(quotedMessage = {}) {
  let root = quotedMessage || {};

  // Unwrap ephemeral: { ephemeralMessage: { message: { ... } } }
  if (root.ephemeralMessage && root.ephemeralMessage.message) {
    root = root.ephemeralMessage.message;
  }

  const v1  = root?.viewOnceMessage?.message;
  const v2  = root?.viewOnceMessageV2?.message;
  const v2x = root?.viewOnceMessageV2Extension?.message;

  const msg = v1 || v2 || v2x || root;

  const image =
    msg?.imageMessage && (msg.imageMessage.viewOnce !== false)
      ? msg.imageMessage
      : null;

  const video =
    msg?.videoMessage && (msg.videoMessage.viewOnce !== false)
      ? msg.videoMessage
      : null;

  // Ambil contextInfo dari media dulu, kalau tidak ada baru fallback ke msg/root
  const ctx =
    image?.contextInfo ||
    video?.contextInfo ||
    msg?.contextInfo ||
    root?.contextInfo ||
    {};

  return { image, video, ctx };
}

/** Ambil JID pengirim VO dari context extendedText yang kamu balas */
function getQuotedSenderJid(message) {
  const ci = message?.message?.extendedTextMessage?.contextInfo || {};
  const jid = ci.participant || ci.remoteJid || message?.key?.participant || '';
  return jid || null;
}

/** Hitung jumlah token @... apa adanya (tanpa mengubah teks) */
function countAtTokens(text = '') {
  const re = /(^|\s)@(?=\S)/g;
  let c = 0;
  while (re.exec(String(text)) !== null) c++;
  return c;
}

/** Label untuk @pengirim (pakai nama kontak jika ada; fallback +nomor) */
function labelForSender(jid) {
  try {
    const c = global?.store?.contacts?.[jid] || {};
    const name = c.name || c.notify || c.verifiedName;
    if (name && String(name).trim()) {
      return '@' + String(name).replace(/\s+/g, '_').slice(0, 32);
    }
  } catch {}
  const num = String(jid || '').split('@')[0] || '';
  return num ? '@+' + num : '@pengirim';
}

/** Sanitizer aman untuk caption TANPA mention */
function safeCaption(text = '') {
  const ZWSP = '\u200B';
  let s = String(text || '');

  // 1) Matikan mention mentah
  s = s.replace(/(^|\s)@(?=\S)/g, '$1@~');

  // 2) Putus digit panjang (nomor telp dll)
  s = s.replace(/(\+?)(\d{7,15})\b/g, (_, plus, digits) =>
    plus + digits.replace(/(\d{3})(?=\d)/g, '$1' + ZWSP)
  );

  // 3) Khusus 62xxxxxx
  s = s.replace(/\b62(\d{5,})\b/g, (_, rest) =>
    '62' + rest.replace(/(\d{2})(?=\d)/g, '$1' + ZWSP)
  );

  return s.trim();
}

function buildHead(kind) {
  return kind === 'image'
    ? '📸 *View Once Image Unlocked*\n\n'
    : '🎬 *View Once Video Unlocked*\n\n';
}

async function viewonceCommand(sock, chatId, message) {
  try {
    const quoted =
      message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // React kecil biar user tau proses
    try {
      await sock.sendMessage(chatId, {
        react: { text: '🔓', key: message.key }
      });
    } catch {}

    if (!quoted) {
      await sock.sendMessage(
        chatId,
        {
          text:
            '❌ *Tidak ada pesan dibalas.*\n' +
            'Balas *foto/video sekali lihat (🔒)* lalu kirim perintah ini.',
          ...channelInfo
        },
        { quoted: message }
      );
      return;
    }

    const { image: qImg, video: qVid, ctx } = unwrapViewOnce(quoted);
    const senderJid = getQuotedSenderJid(message);

    const sendMedia = async (kind, mediaMsg, type) => {
      // ===== GUARD 1: mediaMsg harus ada =====
      if (!mediaMsg) {
        await sock.sendMessage(
          chatId,
          {
            text:
              '❌ Media *sekali lihat* tidak ditemukan di pesan tersebut.\n' +
              'Coba balas langsung ke pesan yang ada ikon *🔒* ya.',
            ...channelInfo
          },
          { quoted: message }
        );
        return;
      }

      // ===== GUARD 2: mediaKey & url wajib ada, kalau kosong → kasus kamu =====
      const hasKey = mediaMsg.mediaKey && mediaMsg.mediaKey.length;
      const hasUrl = mediaMsg.url;
      if (!hasKey || !hasUrl) {
        await sock.sendMessage(
          chatId,
          {
            text:
              '❌ Tidak bisa membuka media ini.\n' +
              'Kemungkinan besar:\n' +
              '• Media sudah kadaluarsa / dihapus oleh WhatsApp\n' +
              '• Yang dibalas *bukan* pesan asli sekali lihat (cuma jejak/forward)\n\n' +
              'Silakan balas *pesan view-once asli* lalu coba lagi.',
            ...channelInfo
          },
          { quoted: message }
        );
        return;
      }

      // ===== Download aman dengan try/catch =====
      let stream;
      try {
        stream = await downloadContentFromMessage(mediaMsg, type);
      } catch (e) {
        console.error('Error downloadContentFromMessage viewonce:', e);
        await sock.sendMessage(
          chatId,
          {
            text:
              '⚠️ Gagal mengunduh media *sekali lihat* dari server WhatsApp.\n' +
              'Coba kirim ulang media aslinya lalu ulangi perintah.',
            ...channelInfo
          },
          { quoted: message }
        );
        return;
      }

      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const original = mediaMsg?.caption || '';
      const atCount = countAtTokens(original);
      const ctxMent = Array.isArray(ctx?.mentionedJid) ? ctx.mentionedJid : [];

      const head = buildHead(kind);
      const tail = '\n\n✨ Dibuka oleh Andika Bot';

      const payload =
        kind === 'image'
          ? {
              image: buffer,
              fileName: `Andika_ViewOnce_${Date.now()}.jpg`
            }
          : {
              video: buffer,
              fileName: `Andika_ViewOnce_${Date.now()}.mp4`
            };

      // 1) Ada mention & jumlah token cocok → pass-through
      if (atCount > 0 && atCount === ctxMent.length) {
        let cap = head + original;

        // Tambahkan sender @ di akhir caption (opsional & aman untuk pairing)
        if (ADD_SENDER_AT_WHEN_MENTION && senderJid) {
          const senderLabel = labelForSender(senderJid); // contoh: @Dek_Ririn atau @+628xx
          cap += `\n👤 Pengirim: ${senderLabel}`;
          payload.mentions = [...ctxMent, senderJid];
        } else {
          payload.mentions = ctxMent;
        }

        payload.caption = cap + tail;
      }
      // 2) Tidak ada mention → aman tanpa mentions
      else if (atCount === 0) {
        payload.caption =
          head + (safeCaption(original) || '_Tidak ada caption_') + tail;
      }
      // 3) Ada mention tapi jumlah tidak match → hindari salah ping
      else {
        payload.caption =
          head + (safeCaption(original) || '_Tidak ada caption_') + tail;
      }

      await sock.sendMessage(
        chatId,
        { ...payload, ...channelInfo },
        { quoted: message }
      );
    };

    if (qImg) {
      await sendMedia('image', qImg, 'image');
      return;
    }
    if (qVid) {
      await sendMedia('video', qVid, 'video');
      return;
    }

    await sock.sendMessage(
      chatId,
      {
        text:
          '❌ *Bukan pesan sekali lihat!*\n' +
          'Balas pesan yang ada ikon *🔒* untuk membuka.',
        ...channelInfo
      },
      { quoted: message }
    );
  } catch (err) {
    console.error('❌ Error viewonceCommand:', err);
    await sock.sendMessage(
      chatId,
      {
        text:
          '⚠️ Gagal membuka media *sekali lihat*.\n' +
          'Pastikan kamu membalas langsung ke pesannya (bukan forward).',
        ...channelInfo
      },
      { quoted: message }
    );
  }
}

module.exports = viewonceCommand;
