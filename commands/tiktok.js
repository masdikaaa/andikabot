// commands/tiktok.js — NekoLabs TikTok Downloader (NO AUDIO) — reaction only
'use strict';

const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

const API_URL = 'https://api.nekolabs.web.id/downloader/tiktok';
const REQUEST_TIMEOUT = 30_000;

// Anti double execute
const processedMessages = new Set();
const onceFor = (id, ttlMs = 5 * 60_000) => {
  if (processedMessages.has(id)) return false;
  processedMessages.add(id);
  setTimeout(() => processedMessages.delete(id), ttlMs);
  return true;
};

// Ambil URL dari teks
function extractUrlFromText(text = '') {
  const parts = String(text || '').trim().split(/\s+/);
  if (parts.length && parts[0].startsWith('.')) parts.shift();
  const url = parts.find(p => /^https?:\/\//i.test(p)) || parts.join(' ');
  return (url || '').trim();
}

// Validasi link TikTok
function isTikTokUrl(u = '') {
  const patterns = [
    /https?:\/\/(?:www\.)?tiktok\.com\//i,
    /https?:\/\/vm\.tiktok\.com\//i,
    /https?:\/\/vt\.tiktok\.com\//i,
    /https?:\/\/(?:www\.)?tiktok\.com\/@/i,
    /https?:\/\/(?:www\.)?tiktok\.com\/t\//i
  ];
  return patterns.some(rx => rx.test(u));
}

// Caption
function buildCaption(result, srcUrl) {
  const title = result?.title ? result.title.trim() : 'Tanpa judul';
  const name = result?.author?.name ? `👤 ${result.author.name}` : '';
  const user = result?.author?.username ? ` (${result.author.username})` : '';
  const stats = result?.stats
    ? `▶️ ${result.stats.play}   ❤️ ${result.stats.like}   💬 ${result.stats.comment}   🔁 ${result.stats.share}`
    : '';
  const created = result?.create_at ? `🗓️ ${result.create_at}` : '';

  return [
    '╭─〔 📥 Unduh TikTok 〕',
    '│ Andika Bot',
    '╰──────────────────',
    `📝 *Judul:* ${title}`,
    name || user ? `${name}${user}` : '',
    created,
    stats,
    '',
    `🔗 Sumber: ${srcUrl}`,
  ].filter(Boolean).join('\n');
}

// Handler: .tiktok <url>
async function tiktokCommand(sock, chatId, message) {
  // helper: safe react update (abaikan error kecil)
  const react = async (emoji) => {
    try {
      await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } });
    } catch {}
  };

  try {
    if (!onceFor(message?.key?.id)) return;

    const text = message?.message?.conversation
      || message?.message?.extendedTextMessage?.text
      || '';
    const url = extractUrlFromText(text);

    if (!url) {
      await sock.sendMessage(chatId, {
        text: '⚠️ Kirim tautan *video TikTok* setelah perintah.\nContoh: *.tiktok https://www.tiktok.com/@user/video/123*',
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    if (!isTikTokUrl(url)) {
      await sock.sendMessage(chatId, {
        text: '❌ Itu bukan tautan TikTok yang valid. Kirim link video TikTok yang benar.',
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    // Mulai proses → reaction saja
    await react('🔄');

    // Panggil NekoLabs
    const { data } = await axios.get(API_URL, {
      params: { url },
      timeout: REQUEST_TIMEOUT
    });

    if (!data?.success || !data?.result?.videoUrl) {
      throw new Error('API mengembalikan format tidak valid / videoUrl kosong');
    }

    const { result } = data;
    const caption = buildCaption(result, url);

    // Kirim video via URL → fallback buffer bila perlu
    try {
      await sock.sendMessage(chatId, {
        video: { url: result.videoUrl },
        mimetype: 'video/mp4',
        caption,
        ...(channelInfo || {})
      }, { quoted: message });
    } catch {
      const vidResp = await axios.get(result.videoUrl, {
        responseType: 'arraybuffer',
        timeout: 60_000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      await sock.sendMessage(chatId, {
        video: Buffer.from(vidResp.data),
        mimetype: 'video/mp4',
        caption,
        ...(channelInfo || {})
      }, { quoted: message });
    }

    // Selesai → reaction sukses
    await react('✅');

  } catch (err) {
    console.error('[tiktok] error:', err?.message || err);
    await react('❌');
    await sock.sendMessage(chatId, {
      text:
`❌ *Gagal mengunduh video TikTok.*

Kemungkinan:
• Link tidak valid / video dihapus / dibatasi
• Server sedang sibuk
• URL kadaluarsa

Coba kirim link lain atau ulang beberapa saat lagi.`,
      ...(channelInfo || {})
    }, { quoted: message });
  }
}

module.exports = tiktokCommand;
