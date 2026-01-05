// commands/capcut.js — CapCut Downloader (NekoLabs) — Andika Bot style
'use strict';

const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

// ===== Config =====
const API_ENDPOINT = 'https://api.nekolabs.web.id/downloader/capcut';
const REQ_TIMEOUT  = 25_000;

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

function extractUrlFromText(raw = '') {
  const parts = String(raw || '').trim().split(/\s+/);
  if (parts.length && parts[0].startsWith('.')) parts.shift(); // buang prefix command (.capcut)
  // gabungan token mengandung URL (biar "…/Zxxx +judul" tetap kepisah)
  const urlToken = parts.find(p => /^https?:\/\//i.test(p));
  return (urlToken || '').trim();
}

function isCapcutUrl(u = '') {
  return /https?:\/\/(?:www\.)?(capcut\.com|capcut\.net)\/\S+/i.test(u);
}

function HEAD(title = '📥 CapCut Downloader') {
  return [
    '╭─〔 ' + title + ' 〕',
    '│ Andika Bot',
    '╰──────────────────'
  ].join('\n');
}

function buildCaption(result, srcUrl) {
  const title  = result?.title || 'Tanpa judul';
  const author = result?.author?.name ? `👤 ${result.author.name}` : '';
  const link   = srcUrl ? `\n🔗 ${srcUrl}` : '';
  return `${HEAD('📥 CapCut Downloader')}
📝 *Judul:* ${title}
${author}${link}`;
}

// ===== API call (simple 429 retry) =====
async function fetchCapcut(url) {
  const req = () => axios.get(API_ENDPOINT, {
    params: { url },
    timeout: REQ_TIMEOUT,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    validateStatus: s => s >= 200 && s < 500
  });
  let res = await req();
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1500));
    res = await req();
  }
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const body = res.data || {};
  if (!body.success || !body.result?.videoUrl) throw new Error('Bad payload / videoUrl kosong');
  return body.result; // { title, author{...}, videoUrl }
}

// ===== Command Handler =====
// Usage: .capcut <url CapCut>
async function capcutCommand(sock, chatId, message) {
  const react = async (emoji) => { try {
    await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } });
  } catch {} };

  try {
    if (!onceFor(message?.key?.id)) return;

    const raw  = extractText(message);
    const url  = extractUrlFromText(raw) || '';
    if (!url || !isCapcutUrl(url)) {
      await sock.sendMessage(chatId, {
        text: `${HEAD('📥 CapCut Downloader')}
⚠️ Kirim *URL CapCut* yang valid setelah perintah.

Contoh:
• .capcut https://www.capcut.com/tv2/ZSBwF9X2g/`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    await react('🔄');

    const result  = await fetchCapcut(encodeURI(url));
    const caption = buildCaption(result, url);

    // kirim video via URL → fallback buffer
    let sent = false;
    try {
      await sock.sendMessage(chatId, {
        video: { url: result.videoUrl },
        mimetype: 'video/mp4',
        caption,
        ...(channelInfo || {})
      }, { quoted: message });
      sent = true;
    } catch (e) {
      console.error('[capcut] send via url gagal, coba buffer:', e?.message || e);
      try {
        const resp = await axios.get(result.videoUrl, {
          responseType: 'arraybuffer',
          timeout: 60_000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        await sock.sendMessage(chatId, {
          video: Buffer.from(resp.data),
          mimetype: 'video/mp4',
          caption,
          ...(channelInfo || {})
        }, { quoted: message });
        sent = true;
      } catch (ee) {
        console.error('[capcut] buffer gagal:', ee?.message || ee);
      }
    }

    if (!sent) {
      await react('❌');
      await sock.sendMessage(chatId, {
        text: `${HEAD('📥 CapCut Downloader')}
❌ Gagal mengirim video. Coba link lain atau ulang beberapa saat lagi.`,
        ...(channelInfo || {})
      }, { quoted: message });
      return;
    }

    await react('✅');
  } catch (err) {
    console.error('[capcut] error:', err?.message || err);
    await react('❌');
    await sock.sendMessage(chatId, {
      text: `${HEAD('📥 CapCut Downloader')}
❌ Terjadi kesalahan saat memproses permintaan. Coba lagi nanti.`,
      ...(channelInfo || {})
    }, { quoted: message });
  }
}

module.exports = capcutCommand;
