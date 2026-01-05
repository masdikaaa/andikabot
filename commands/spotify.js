// commands/spotify.js — Andika Bot + API siputzx (/api/d/spotify) — reaction-only
'use strict';

const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

// ===== Config =====
const API_ENDPOINT = 'https://api.siputzx.my.id/api/d/spotify';
const REQ_TIMEOUT  = 20_000;

// ===== De-dupe =====
const processed = new Set();
function onceFor(id, ttlMs = 5 * 60_000) {
  if (!id) return true;
  if (processed.has(id)) return false;
  processed.add(id);
  setTimeout(() => processed.delete(id), ttlMs);
  return true;
}

// ===== Utils =====
function extractText(message) {
  return message?.message?.conversation?.trim()
    || message?.message?.extendedTextMessage?.text?.trim()
    || message?.message?.imageMessage?.caption?.trim()
    || message?.message?.videoMessage?.caption?.trim()
    || '';
}

function extractSpotifyUrl(raw = '') {
  const parts = String(raw || '').trim().split(/\s+/);
  if (parts.length && parts[0].startsWith('.')) parts.shift(); // buang prefix command
  const url = parts.find(p => /^https?:\/\//i.test(p));
  return (url || '').trim();
}

function isSpotifyUrl(u = '') {
  return /https?:\/\/(?:open\.spotify\.com|spotify\.link)\/(?:track|album|playlist)\//i.test(u);
}

function safeFileName(name = 'track') {
  return String(name).replace(/[\\/:*?"<>|\r\n]+/g, '').trim() || 'track';
}

function HEAD(title = '🎵 Spotify Downloader') {
  return [
    '╭─〔 ' + title + ' 〕',
    '│ Andika Bot',
    '╰──────────────────'
  ].join('\n');
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function buildCaption(d) {
  const title   = d?.title || d?.songTitle || 'Tanpa Judul';
  const artist  = d?.artis || d?.artist || '—';
  const type    = d?.type ? d.type.toUpperCase() : '—';
  const dur     = d?.durasi ? fmtDuration(d.durasi) : '—';
  const link    = d?.url ? `\n🔗 ${d.url}` : '';
  return `${HEAD('🎵 Spotify Downloader')}
🎵 *Judul:* ${title}
👤 *Artis:* ${artist}
🗂️ *Tipe:* ${type}
⏱️ *Durasi:* ${dur}${link}`;
}

// ===== API Call (with simple 429 retry) =====
async function fetchFromSiputz(url) {
  const doReq = () => axios.get(API_ENDPOINT, {
    params: { url },
    timeout: REQ_TIMEOUT,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    validateStatus: s => s >= 200 && s < 500
  });

  let res = await doReq();
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1500));
    res = await doReq();
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const body = res.data || {};
  if (!body.status || !body.data) throw new Error('Bad payload');
  return body.data; // { title,type,artis,durasi,image,download,status, ... }
}

// ===== Command Handler =====
async function spotifyCommand(sock, chatId, message) {
  const react = async (emoji) => { try {
    await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } });
  } catch {} };

  try {
    if (!onceFor(message?.key?.id)) return;

    const raw = extractText(message);
    const url = extractSpotifyUrl(raw) || (isSpotifyUrl(raw) ? raw : '');

    if (!url || !isSpotifyUrl(url)) {
      await sock.sendMessage(chatId, {
        text: `${HEAD('🎵 Spotify Downloader')}
⚠️ Kirim *URL Spotify* (track/album/playlist) setelah perintah.

Contoh:
• .spotify https://open.spotify.com/track/…`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    await react('🔄');

    const data = await fetchFromSiputz(url);
    const caption = buildCaption(data);
    const cover   = data?.image || data?.coverImage || '';
    const audio   = data?.download || ''; // mp3 dari API ini

    // Kirim cover + caption (jika ada)
    try {
      if (cover) {
        await sock.sendMessage(chatId, {
          image: { url: cover },
          caption,
          ...(channelInfo || {})
        }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, {
          text: caption,
          ...(channelInfo || {})
        }, { quoted: message });
      }
    } catch (e) {
      console.error('[SPOTIFY] kirim caption/cover gagal:', e?.message || e);
    }

    if (!audio) {
      await react('❌');
      await sock.sendMessage(chatId, {
        text: `${HEAD('🎵 Spotify Downloader')}
ℹ️ Sumber tidak menyediakan *file MP3* untuk URL ini.`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    // Kirim audio → buffer dulu, fallback URL
    const fileName = `${safeFileName(data?.title || 'track')}.mp3`;
    let sent = false;

    try {
      const resp = await axios.get(audio, {
        responseType: 'arraybuffer',
        timeout: 30_000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      await sock.sendMessage(chatId, {
        audio: Buffer.from(resp.data),
        mimetype: 'audio/mpeg',
        fileName,
        ...(channelInfo || {})
      }, { quoted: message });
      sent = true;
    } catch (e) {
      console.error('[SPOTIFY] unduh buffer gagal:', e?.message || e);
    }

    if (!sent) {
      try {
        await sock.sendMessage(chatId, {
          audio: { url: audio },
          mimetype: 'audio/mpeg',
          fileName,
          ...(channelInfo || {})
        }, { quoted: message });
        sent = true;
      } catch (e) {
        console.error('[SPOTIFY] fallback URL gagal:', e?.message || e);
        await react('❌');
        await sock.sendMessage(chatId, {
          text: `${HEAD('🎵 Spotify Downloader')}
❌ Gagal mengirim audio. Coba ulang beberapa saat lagi.`,
          ...(channelInfo || {})
        }, { quoted: message });
        return;
      }
    }

    await react('✅');
  } catch (err) {
    console.error('[SPOTIFY] error:', err?.message || err);
    await react('❌');
    await sock.sendMessage(chatId, {
      text: `${HEAD('🎵 Spotify Downloader')}
❌ Terjadi kesalahan saat memproses permintaan. Coba lagi nanti.`,
      ...(channelInfo || {})
    }, { quoted: message });
  }
}

module.exports = spotifyCommand;
