// commands/resi.js — Cek resi (JNE/JNT/SiCepat/AnterAja/Pos/ID Express, dll.)
// Andika Bot • Baileys v7 safe
'use strict';

const axios = require('axios');

// === badge channel Andika Bot (aman bila nggak ada) ===
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

/* ========================
   Kurir & helper text
======================== */
const KNOWN_COURIERS = {
  'JNE': 'JNE', 'jne': 'JNE',
  'JNT': 'JNT', 'J&T': 'JNT', 'jnt': 'JNT', 'j&t': 'JNT',
  'SICEPAT': 'SICEPAT', 'SICEPATREG': 'SICEPAT', 'sicepat': 'SICEPAT',
  'ANTERAJA': 'ANTERAJA', 'ANTER AJA': 'ANTERAJA', 'anteraja': 'ANTERAJA', 'anter aja': 'ANTERAJA',
  'POS': 'POS', 'POSINDO': 'POS', 'pos': 'POS', 'posindo': 'POS',
  'IDEXPRESS': 'IDEXPRESS', 'ID EXPRESS': 'IDEXPRESS', 'idexpress': 'IDEXPRESS',
  'TIKI': 'TIKI', 'tiki': 'TIKI',
  'WAHANA': 'WAHANA', 'Wahana': 'WAHANA', 'wahana': 'WAHANA',
};
const COURIER_LIST_STR = 'JNE, JNT, SiCepat, AnterAja, POS, IDExpress, TIKI, Wahana';

function usage() {
  return [
    '╭─〔 🔎 *CEK RESI* 〕',
    '│ Contoh:',
    '│ • *.resi JNE 1234567890*',
    '│ • *.resi 1234567890 JNT*',
    `│ Kurir didukung: ${COURIER_LIST_STR}`,
    '╰────────────────────',
  ].join('\n');
}

/* ========================
   Waktu → WIB
======================== */
function formatWIB(dtLike) {
  try {
    if (!dtLike) return '-';
    let dt;
    if (typeof dtLike === 'string') {
      const s = dtLike.replace('T', ' ').replace('Z', '').trim();
      dt = new Date(s);
      if (isNaN(dt.getTime())) return dtLike; // biarin apa adanya
    } else {
      dt = new Date(dtLike);
    }
    const opts = { timeZone: 'Asia/Jakarta', hour12: false };
    const dd = new Intl.DateTimeFormat('id-ID', { day: '2-digit', ...opts }).format(dt);
    const mo = new Intl.DateTimeFormat('id-ID', { month: 'short', ...opts }).format(dt);
    const yy = new Intl.DateTimeFormat('id-ID', { year: 'numeric', ...opts }).format(dt);
    const hm = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', ...opts }).format(dt);
    return `${dd} ${mo} ${yy} • ${hm} WIB`;
  } catch { return '-'; }
}

/* ========================
   Parser argumen
   (.resi <kurir> <resi>) / (.resi <resi> <kurir>)
======================== */
function pickCourierAndResi(argsStr = '') {
  const parts = String(argsStr || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return { courier: null, resi: null };

  let courier = null, resi = null;

  for (const p of parts) {
    const key = p.toUpperCase();
    if (KNOWN_COURIERS[key] || KNOWN_COURIERS[p]) { courier = KNOWN_COURIERS[key] || KNOWN_COURIERS[p]; break; }
    if (/^J&?T$/i.test(p)) { courier = 'JNT'; break; } // J&T
  }

  if (courier) {
    const nonCourier = parts.filter(x => {
      const k = x.toUpperCase();
      return !(KNOWN_COURIERS[k] || /^J&?T$/i.test(x));
    });
    resi = nonCourier.join('').replace(/[^0-9A-Za-z]/g, '');
  } else {
    const maybeResi = parts[0];
    const maybeCourier = parts.slice(1).join(' ');
    const kc = KNOWN_COURIERS[maybeCourier] || KNOWN_COURIERS[maybeCourier.toUpperCase()];
    if (kc) {
      resi = String(maybeResi).replace(/[^0-9A-Za-z]/g, '');
      courier = kc;
    }
  }

  if (!resi || !courier) return { courier: null, resi: null };
  return { courier, resi };
}

/* ========================
   Render riwayat
======================== */
function renderHistory(history = []) {
  if (!Array.isArray(history) || history.length === 0) return '— (belum ada riwayat status) —';
  const lines = [];
  history.forEach((h, i) => {
    const timeStr = formatWIB(h?.date || h?.datetime || h?.time || h?.timestamp || '');
    const loc = (h?.location || h?.city || h?.area || '').trim?.() || '';
    const desc = (h?.desc || h?.description || h?.status || '').trim?.() || '';
    lines.push(`${i + 1}. ${timeStr}\n    📍 ${loc || '-'}\n    ✍️ ${desc || '-'}`);
  });
  return lines.join('\n');
}

/* ========================
   HTTP client (tanpa zstd)
======================== */
const http = axios.create({
  timeout: 15000,
  validateStatus: () => true,
  responseType: 'text',                    // kita parse manual
  headers: {
    // JANGAN tawarkan zstd agar Cloudflare tidak kirim zstd
    'accept-encoding': 'gzip, deflate, br',
    'accept': 'application/json, */*',
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'user-agent': 'AndikaBot/3.3.0 (+https://whatsapp.com)'
  },
  transformResponse: [data => data]        // jangan diubah axios
});

function safeJsonParse(str) {
  if (str == null) return null;
  if (typeof str !== 'string') return str;
  try { return JSON.parse(str); } catch { return null; }
}

function isTruthyStatus(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj.status;
  const ok = obj.ok;
  const succ = obj.success;
  return (s === true || s === 'true' || ok === true || succ === true);
}

async function doRequest(url, forceNoZstd = false) {
  const headers = forceNoZstd
    ? { 'accept-encoding': 'gzip, deflate, br' } // pastikan override
    : undefined;

  const resp = await http.get(url, { headers });
  const enc = String(resp.headers?.['content-encoding'] || '').toLowerCase();

  // Kalau tetap zstd (misal CF ngeyel), re-fetch paksa tanpa zstd
  if (enc.includes('zstd') || enc.includes('z-standard')) {
    // re-fetch sekali lagi, explicit
    return http.get(url, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
  }
  return resp;
}

async function fetchResi(courier, resi, maxRetry = 2) {
  const url = `https://api.siputzx.my.id/api/check/resi?resi=${encodeURIComponent(resi)}&courier=${encodeURIComponent(courier)}`;

  let lastErrBody = null;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const resp = await doRequest(url, attempt > 0);
      const { status } = resp;
      const enc = String(resp.headers?.['content-encoding'] || '').toLowerCase();

      // parse manual
      let body = resp.data;
      let json = safeJsonParse(body);

      if (!json && typeof body === 'string') {
        // bersihkan prefix non-JSON (kadang ada noise)
        const idx = body.indexOf('{');
        if (idx >= 0) json = safeJsonParse(body.slice(idx));
      }

      // 5xx → retry
      if (status >= 500) {
        lastErrBody = { code: status, data: (json || body) };
        await new Promise(r => setTimeout(r, 500 + attempt * 400));
        continue;
      }

      // 429 → retry
      if (status === 429) {
        lastErrBody = { code: status, data: json || body };
        await new Promise(r => setTimeout(r, 700 + attempt * 500));
        continue;
      }

      // 200/4xx: nilai sendiri
      if (!json || !isTruthyStatus(json) || !json.data) {
        // 200 tapi isinya biner (zstd) → paksa ulang 1x tanpa zstd
        const looksBinary = typeof body === 'string' && /[\u0000-\u001f\u007f]/.test(body);
        if (status === 200 && (enc.includes('zstd') || looksBinary) && attempt < maxRetry) {
          console.warn('[resiCommand] 200 tapi kemungkinan terkompres zstd/biner. Ulang dengan no-zstd…');
          await new Promise(r => setTimeout(r, 300));
          continue;
        }

        if (status === 200) {
          const snippet = typeof body === 'string'
            ? body.slice(0, 180).replace(/\s+/g, ' ')
            : JSON.stringify(body).slice(0, 180);
          console.warn('[resiCommand] 200 tetapi bukan JSON/status false. Snippet:', snippet);
        }

        return { ok: false, error: (json && (json.error || json.message)) || 'Failed to track package.', code: status };
      }

      return { ok: true, data: json.data, ts: json.timestamp, code: status };
    } catch (e) {
      lastErrBody = { code: 0, error: e?.message || String(e) };
      await new Promise(r => setTimeout(r, 500 + attempt * 400));
      continue;
    }
  }
  return { ok: false, ...(lastErrBody || {}), error: lastErrBody?.error || 'Network/Server error' };
}

/* ========================
   Command utama
======================== */
async function resiCommand(sock, chatId, message, argsStr) {
  try {
    const { courier, resi } = pickCourierAndResi(argsStr);
    if (!courier || !resi) {
      await sock.sendMessage(chatId, { text: usage(), ...baseChannelInfo }, { quoted: message });
      return;
    }

    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);

    const result = await fetchResi(courier, resi, 2);

    if (!result.ok) {
      const code = result.code;
      const tooMany = code === 429;
      const serverErr = code >= 500 || code === 0;

      const msg = [
        '❌ *Gagal mengambil data resi.*',
        tooMany ? '⚠️ Kena rate limit dari API. Coba beberapa saat lagi.' : '',
        serverErr ? '⚠️ Server API bermasalah/menolak koneksi. Sudah dicoba ulang otomatis.' : '',
        result.error ? `ℹ️ Info: ${result.error}` : '',
        '',
        usage()
      ].filter(Boolean).join('\n');

      await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
      console.error('resiCommand error:', { status: false, error: result.error || 'Failed', code });
      return;
    }

    const d = result.data;
    const nowWIB = formatWIB(result.ts);

    const out = [];
    out.push('╭─〔 📦 *HASIL CEK RESI* 〕');
    out.push(`│ 🏷️ Kurir   : *${d.courier || courier}*`);
    out.push(`│ 🔢 Nomor   : *${d.resi || resi}*`);
    out.push(`│ 🕒 Diambil : *${nowWIB || '-'}*`);
    out.push('╰────────────────────────');

    out.push('');
    out.push(`*Status:* ${d.status ? `*${String(d.status).trim()}*` : '-'}`);
    if (d.message) out.push(String(d.message).trim());

    out.push('');
    out.push('*Riwayat:*');
    out.push(renderHistory(d.history));

    if (d.tips) {
      const tip = String(d.tips).trim();
      if (tip) {
        out.push('');
        out.push('💡 *Tips*');
        out.push(tip.length > 400 ? tip.slice(0, 400) + '…' : tip);
      }
    }

    await sock.sendMessage(chatId, { text: out.join('\n'), ...baseChannelInfo }, { quoted: message });

  } catch (err) {
    const code = err?.response?.status;
    const tooMany = code === 429;
    const msg = [
      '❌ *Gagal mengambil data resi.*',
      tooMany ? '⚠️ Kena rate limit dari API. Coba beberapa saat lagi.' : '',
      '',
      usage()
    ].filter(Boolean).join('\n');

    await sock.sendMessage(chatId, { text: msg, ...baseChannelInfo }, { quoted: message });
    console.error('resiCommand fatal:', err?.response?.data || err?.message || err);
  }
}

module.exports = resiCommand;
