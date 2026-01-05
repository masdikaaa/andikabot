// commands/facebook.js — Facebook downloader (NekoLabs GET) — Andika Bot style + anti-spam
'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

/* ========== BRAND / UI ========== */
const BRAND = 'Andika Bot';
const ICON  = { dl: '📥', ok: '✅', warn: '⚠️', err: '❌' };
const HEAD = (title) =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363421594431163@newsletter',
      newsletterName: BRAND,
      serverMessageId: -1
    }
  }
};

/* ========== ANTI-SPAM ========== */
// Gate 1: by message id atau synthetic id (kalau id kosong)
const seenIds = new Set();
// Gate 2: by chatId + resolved URL (mencegah kirim berulang untuk URL sama)
const seenUrlKeys = new Set();

function remember(set, key, ttlMs = 5 * 60_000) {
  set.add(key);
  const t = setTimeout(() => set.delete(key), ttlMs);
  if (typeof t.unref === 'function') t.unref();
}

/* ========== HELPERS ========== */
function extractText(message) {
  return message?.message?.conversation?.trim()
    || message?.message?.extendedTextMessage?.text?.trim()
    || message?.message?.imageMessage?.caption?.trim()
    || message?.message?.videoMessage?.caption?.trim()
    || '';
}

function extractUrlFromMessage(message) {
  const raw = extractText(message);
  const parts = raw.trim().split(/\s+/);
  if (parts[0]?.startsWith('.')) parts.shift();

  const fromText = parts.find(p => /^https?:\/\//i.test(p));
  if (fromText) return fromText.trim();

  const q =
    message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
    || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text
    || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption
    || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.caption
    || '';
  const qUrl = (q || '').split(/\s+/).find(p => /^https?:\/\//i.test(p));
  return qUrl ? qUrl.trim() : '';
}

function isFacebookUrl(u = '') {
  return /https?:\/\/(?:www\.)?(facebook\.com|fb\.watch)\//i.test(u);
}

// Hapus query tracking yang bikin URL beda-beda tipis
function normalizeFb(u) {
  try {
    const x = new URL(u);
    [
      'mibextid','ref','refsrc','__tn__','paipv','locale','fbclid','eid',
      'acontext','hc_ref','acontext_ref','acontext_ref_type','amibextid'
    ].forEach(k => x.searchParams.delete(k));
    return x.toString();
  } catch {
    return u;
  }
}

function pickBestVideo(medias = []) {
  const videos = (Array.isArray(medias) ? medias : []).filter(m =>
    String(m?.type).toLowerCase() === 'video' &&
    String(m?.extension).toLowerCase() === 'mp4' &&
    typeof m?.url === 'string' && m.url
  );
  return videos[0] || null; // urutan API biasanya kualitas terbaik dulu
}

async function react(sock, chatId, key, emoji) {
  try { await sock.sendMessage(chatId, { react: { text: emoji, key } }); } catch {}
}

/* ========== MAIN COMMAND ========== */
async function facebookCommand(sock, chatId, message) {
  try {
    // Ambil URL paling awal untuk synthetic id (kalau key.id kosong)
    const urlRaw0 = extractUrlFromMessage(message) || '';
    const synthId = (message?.key?.id || '').trim() || `${chatId}||${urlRaw0}`;
    if (seenIds.has(synthId)) return;
    remember(seenIds, synthId); // Gate 1 aktif

    // Validasi URL
    if (!urlRaw0) {
      await sock.sendMessage(chatId, {
        text: [
          HEAD(`${ICON.dl} Unduh Facebook`),
          'Kirim tautan *Facebook / FB Watch* setelah perintah, atau balas pesan yang berisi tautan.',
          '',
          'Contoh:',
          '• *.fb https://www.facebook.com/...*',
          '• Balas link: *.fb*'
        ].join('\n'),
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    if (!isFacebookUrl(urlRaw0)) {
      await sock.sendMessage(chatId, {
        text: `${HEAD(`${ICON.warn} Tautan tidak valid`)}\nHarus tautan *Facebook / FB Watch*.`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    await react(sock, chatId, message.key, '🔄');

    // Resolve redirect & normalisasi
    let resolvedUrl = urlRaw0;
    try {
      const head = await axios.get(urlRaw0, {
        timeout: 20_000,
        maxRedirects: 10,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: s => s >= 200 && s < 400
      });
      const finalUrl = head?.request?.res?.responseUrl;
      if (finalUrl) resolvedUrl = finalUrl;
    } catch { /* abaikan */ }
    resolvedUrl = normalizeFb(resolvedUrl);

    // Gate 2 — tahan spam URL sama di chat yang sama
    const urlKey = `${chatId}||${resolvedUrl}`;
    if (seenUrlKeys.has(urlKey)) return;
    remember(seenUrlKeys, urlKey);

    // Hit NekoLabs (GET)
    const API_URL = 'https://api.nekolabs.web.id/downloader/facebook';
    const resp = await axios.get(API_URL, {
      params: { url: resolvedUrl },
      timeout: 45_000,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      maxRedirects: 5,
      validateStatus: s => s >= 200 && s < 500
    });

    const payload = resp?.data;
    const result = payload?.result || {};
    const medias = result?.medias || [];

    if (!payload?.success || !Array.isArray(medias) || medias.length === 0) {
      await sock.sendMessage(chatId, {
        text: [
          HEAD(`${ICON.err} Gagal mengambil media`),
          'Kemungkinan:',
          '• Tautan privat / dihapus',
          '• API sedang bermasalah',
          '• URL tidak didukung',
        ].join('\n'),
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    const title = result.title?.trim() || 'Facebook Video';
    const bestVid = pickBestVideo(medias);

    // Fallback audio kalau video nggak ada
    if (!bestVid?.url) {
      const audio = medias.find(m => String(m?.type).toLowerCase() === 'audio' && m?.url);
      if (audio) {
        await sock.sendMessage(chatId, {
          audio: { url: audio.url },
          mimetype: 'audio/mpeg',
          ptt: false,
          caption: [
            '╭─〔 ✅ Audio Facebook 〕',
            `│ ${BRAND}`,
            '╰──────────────────',
            `🎧 *${title}*`
          ].join('\n'),
          ...(channelInfo || {})
        }, { quoted: message });
        await react(sock, chatId, message.key, ICON.ok);
        return; // <— penting: stop agar tidak kirim lagi
      }
      await sock.sendMessage(chatId, {
        text: `${HEAD(`${ICON.warn} Tidak ada berkas yang bisa diunduh`)}\nCoba tautan lain ya.`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    // 1) Coba kirim direct URL (lebih cepat & ringan)
    try {
      await sock.sendMessage(chatId, {
        video: { url: bestVid.url },
        mimetype: 'video/mp4',
        caption: [
          '╭─〔 ✅ Facebook Video 〕',
          `│ ${BRAND}`,
          '╰──────────────────',
          `🎬 *${title}*`
        ].join('\n'),
        ...(channelInfo || {})
      }, { quoted: message });

      await react(sock, chatId, message.key, ICON.ok);
      return; // <— penting: stop di sini kalau sukses
    } catch (e) {
      // lanjut ke fallback unduh file
    }

    // 2) Fallback: unduh ke file sementara lalu kirim
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tempFile = path.join(tmpDir, `fb_${Date.now()}.mp4`);

    const streamResp = await axios({
      method: 'GET',
      url: bestVid.url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Range': 'bytes=0-',
        'Connection': 'keep-alive',
        'Referer': 'https://www.facebook.com/'
      },
      timeout: 120_000,
      maxRedirects: 5,
      validateStatus: s => s >= 200 && s < 400
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tempFile);
      streamResp.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stat = fs.statSync(tempFile);
    if (!stat.size) throw new Error('Downloaded file is empty');

    await sock.sendMessage(chatId, {
      video: { url: tempFile },
      mimetype: 'video/mp4',
      caption: [
        '╭─〔 ✅ Facebook Video 〕',
        `│ ${BRAND}`,
        '╰──────────────────',
        `🎬 *${title}*`
      ].join('\n'),
      ...(channelInfo || {})
    }, { quoted: message });

    try { fs.unlinkSync(tempFile); } catch {}

    await react(sock, chatId, message.key, ICON.ok);
    return; // <— penting: stop setelah kirim

  } catch (err) {
    console.error('Facebook downloader error:', err?.message || err);
    await sock.sendMessage(chatId, {
      text: [
        HEAD(`${ICON.err} Gagal mengunduh Facebook`),
        'Silakan coba tautan lain / beberapa saat lagi.',
        '',
        `🧩 *Detail:* ${err?.message || err}`
      ].join('\n'),
      ...(channelInfo || {})
    }, { quoted: message });
  }
}

module.exports = facebookCommand;
