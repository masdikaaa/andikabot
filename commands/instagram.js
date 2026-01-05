// commands/instagram.js — NekoLabs (POST/REEL only, no story)
'use strict';

const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

const IG_API = 'https://api.nekolabs.web.id/downloader/instagram';
const REQ_TIMEOUT = 30_000;
const SEND_DELAY_MS = 700;

// ===== dedup eksekusi per message =====
const processed = new Set();
const onceFor = (id, ttl = 5 * 60_000) => {
  if (!id) return true;
  if (processed.has(id)) return false;
  processed.add(id);
  setTimeout(() => processed.delete(id), ttl);
  return true;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const textOf = (m) => m?.message?.conversation || m?.message?.extendedTextMessage?.text || '';
const partsFrom = (s='') => s.trim().split(/\s+/).filter(Boolean);

const isIgUrl = (u='') => /https?:\/\/(?:www\.)?(instagram\.com|instagr\.am)\//i.test(u);
const isVideoUrl = (u='') => /\.(mp4|m4v|mov|webm|mkv|avi)(\?|$)/i.test(u);

function captionPost(meta = {}, srcUrl = '') {
  const cap = meta?.caption ? meta.caption.trim() : '';
  const uname = meta?.username ? `@${meta.username}` : '';
  const like = (meta?.like ?? '') !== '' ? `❤️ ${meta.like}` : '';
  const com  = (meta?.comment ?? '') !== '' ? `💬 ${meta.comment}` : '';
  const stats = like || com ? `${like}${like && com ? '   ' : ''}${com}` : '';
  return [
    '╭─〔 📥 Instagram Downloader 〕',
    '│ Andika Bot',
    '╰──────────────────',
    uname ? `👤 ${uname}` : '',
    stats,
    cap ? `\n📝 *Caption:*\n${cap}` : '',
    `\n🔗 Sumber: ${srcUrl}`
  ].filter(Boolean).join('\n');
}

async function sendMedia(sock, chatId, quoted, mediaUrl, caption = '', muteCaption = false) {
  const video = isVideoUrl(mediaUrl);
  // coba buffer
  try {
    const res = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.instagram.com/' }
    });
    const buf = Buffer.from(res.data);
    if (video) {
      await sock.sendMessage(
        chatId,
        { video: buf, mimetype: 'video/mp4', caption: muteCaption ? '' : caption, ...(channelInfo || {}) },
        { quoted }
      );
    } else {
      await sock.sendMessage(
        chatId,
        { image: buf, caption: muteCaption ? '' : caption, ...(channelInfo || {}) },
        { quoted }
      );
    }
    return;
  } catch {}
  // fallback URL langsung
  if (video) {
    await sock.sendMessage(
      chatId,
      { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: muteCaption ? '' : caption, ...(channelInfo || {}) },
      { quoted }
    );
  } else {
    await sock.sendMessage(
      chatId,
      { image: { url: mediaUrl }, caption: muteCaption ? '' : caption, ...(channelInfo || {}) },
      { quoted }
    );
  }
}

async function instagramCommand(sock, chatId, message) {
  try {
    if (!onceFor(message?.key?.id)) return;

    const text = textOf(message);
    const parts = partsFrom(text);

    if (parts.length === 0) {
      await sock.sendMessage(chatId, {
        text:
`⚙️ *Instagram Downloader (NekoLabs)*

• *.ig <url>* — unduh post/reel/photo
   (caption disatukan di media pertama, sisanya tanpa caption)

Contoh:
  .ig https://www.instagram.com/reel/DQREKZcj-CW/`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    // buang prefix .ig bila ada
    if (parts[0].startsWith('.')) parts.shift();
    const url = parts.find(p => /^https?:\/\//i.test(p)) || parts.join(' ');

    if (!url || !isIgUrl(url)) {
      await sock.sendMessage(chatId, {
        text: '❌ Itu bukan tautan Instagram yang valid. Kirim tautan *post/reel/photo* yang benar.',
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    const { data } = await axios.get(IG_API, { params: { url }, timeout: REQ_TIMEOUT });
    if (!data?.success || !data?.result?.downloadUrl) {
      throw new Error('API mengembalikan format tidak valid / downloadUrl kosong');
    }

    const meta = data.result.metadata || {};
    const urls = [...new Set(Array.isArray(data.result.downloadUrl) ? data.result.downloadUrl : [])];
    if (urls.length === 0) {
      await sock.sendMessage(chatId, {
        text: '❌ Tidak ada media pada tautan tersebut (mungkin privat/dihapus).',
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    // Media pertama: caption lengkap; sisanya tanpa caption
    const firstCaption = captionPost(meta, url);
    await sendMedia(sock, chatId, message, urls[0], firstCaption, false);

    for (let i = 1; i < Math.min(urls.length, 20); i++) {
      await sleep(SEND_DELAY_MS);
      await sendMedia(sock, chatId, message, urls[i], '', true);
    }

    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

  } catch (err) {
    console.error('[instagram] error:', err?.message || err);
    await sock.sendMessage(chatId, {
      text:
`❌ *Gagal memproses Instagram.*
Coba lagi beberapa saat atau kirim konten lain.`,
      ...(channelInfo || {})
    }, { quoted: message });
  }
}

module.exports = instagramCommand;
