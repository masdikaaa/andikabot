// commands/news.js — Multi-source News (CNN, CNBC, Kompas, Merdeka, Sindo)
// Baileys v7 SAFE • Andika Bot style
'use strict';

const axios = require('axios');

let baseChannelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg && cfg.channelInfo) baseChannelInfo = cfg.channelInfo;
} catch {} // optional

/* =======================
   KONFIGURASI SUMBER
======================= */
const SOURCES = {
  cnn: {
    name: 'CNN Indonesia',
    url: 'https://api.siputzx.my.id/api/berita/cnn',
    pick: (it) => ({
      title: (it.title || '').trim(),
      link: it.link || '',
      category: extractKategori(it.slug) || 'Umum',
      // API kadang punya "time" (YYYY-MM-DD HH:mm)
      dateRaw: it.time || '',
      image: it.image_full || it.image_thumbnail || ''
    })
  },
  cnbc: {
    name: 'CNBC Indonesia',
    url: 'https://api.siputzx.my.id/api/berita/cnbcindonesia',
    pick: (it) => ({
      title: (it.title || '').trim(),
      link: it.link || '',
      category: (it.category || '').trim() || deriveCategoryFromLabel(it.label) || 'Umum',
      dateRaw: (it.date || it.label || '').trim(), // banyak “x menit yang lalu”
      image: it.image || ''
    })
  },
  kompas: {
    name: 'Kompas',
    url: 'https://api.siputzx.my.id/api/berita/kompas',
    pick: (it) => ({
      title: (it.title || '').trim(),
      link: it.link || '',
      category: (it.category || '').trim() || 'Umum',
      dateRaw: (it.date || '').trim(), // contoh: "3 November 2025"
      image: it.image || ''
    })
  },
  merdeka: {
    name: 'Merdeka',
    url: 'https://api.siputzx.my.id/api/berita/merdeka',
    pick: (it) => ({
      title: (it.title || '').trim(),
      link: it.link || '',
      category: (it.category || '').trim() || 'Umum',
      dateRaw: (it.date || '').trim(), // contoh: "3 November 2025 06:33"
      image: it.image || ''
    })
  },
  sindonews: {
    name: 'SINDOnews',
    url: 'https://api.siputzx.my.id/api/berita/sindonews',
    pick: (it) => ({
      title: (it.title || '').trim(),
      link: it.link || '',
      category: (it.category || '').trim() || 'Umum',
      dateRaw: (it.timestamp || '').trim(), // sering “x menit yang lalu”
      image: it.imageUrl || ''
    })
  }
};

// Maksimal item yang ditampilkan
const MAX_ITEMS = 8;

/* =======================
   HELPERS
======================= */

// Capitalize kata pertama
function capFirst(s = '') {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Ekstrak kategori dari slug CNN ("/teknologi/2025.....")
function extractKategori(slug = '') {
  try {
    const p = String(slug).split('/').filter(Boolean);
    return p.length ? capFirst(p[0].replace(/-/g, ' ')) : 'Umum';
  } catch {
    return 'Umum';
  }
}

// Derive kategori dari label CNBC (fallback)
function deriveCategoryFromLabel(label = '') {
  const s = (label || '').toLowerCase();
  if (!s) return '';
  if (s.includes('internasional')) return 'Internasional';
  if (s.includes('market') || s.includes('ekonomi') || s.includes('bisnis')) return 'Ekonomi';
  if (s.includes('tech') || s.includes('tekno')) return 'Tekno';
  return capFirst(s.split(' ')[0]);
}

// Format WIB dari string tanggal beragam
function formatWIB(dateStr = '') {
  if (!dateStr) return '-';

  // Coba format ISO biasa/“YYYY-MM-DD HH:mm”
  // kita treat sebagai UTC lalu tampilkan WIB
  const isoLike = dateStr.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(dateStr);
  if (isoLike) {
    try {
      // normalisasi "YYYY-MM-DD HH:mm" → Date
      let s = dateStr.replace('T', ' ').replace('Z', '').trim();
      const [d, t] = s.split(' ');
      const [Y, M, D] = d.split('-').map(Number);
      const [h = 0, m = 0, sec = 0] = (t || '').split(':').map(Number);
      const dt = new Date(Date.UTC(Y, (M - 1), D, h, m, sec || 0));
      return formatDateToWIB(dt);
    } catch {
      // lewat ke parser lain
    }
  }

  // Coba parse “3 November 2025 06:33” atau “3 November 2025”
  const parsedLocale = tryParseLocaleDateID(dateStr);
  if (parsedLocale) return formatDateToWIB(parsedLocale);

  // Coba parse “15 menit yang lalu”, “1 jam yang lalu”, “kemarin”, dst.
  const rel = tryParseRelativeID(dateStr);
  if (rel) return formatDateToWIB(rel);

  // fallback: tampilkan apa adanya
  return dateStr;
}

// Format ke “DD MMM YYYY • HH:mm WIB”
function formatDateToWIB(dt) {
  try {
    const opts = { timeZone: 'Asia/Jakarta', hour12: false };
    const dd = new Intl.DateTimeFormat('id-ID', { day: '2-digit', timeZone: 'Asia/Jakarta' }).format(dt);
    const mo = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' }).format(dt);
    const yy = new Intl.DateTimeFormat('id-ID', { year: 'numeric', timeZone: 'Asia/Jakarta' }).format(dt);
    const hm = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', ...opts }).format(dt);
    return `${dd} ${mo} ${yy} • ${hm} WIB`;
  } catch {
    return dt.toISOString();
  }
}

// Parse “3 November 2025 06:33” (ID) → Date(UTC)
function tryParseLocaleDateID(s = '') {
  try {
    const months = [
      'januari','februari','maret','april','mei','juni',
      'juli','agustus','september','oktober','november','desember'
    ];
    const m = s.toLowerCase().match(
      /(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/
    );
    if (!m) return null;
    const day = Number(m[1]);
    const monthName = m[2];
    const year = Number(m[3]);
    const hour = Number(m[4] || 0);
    const min = Number(m[5] || 0);
    const month = months.indexOf(monthName);
    if (month < 0) return null;

    // Asumsikan waktu lokal WIB → convert ke UTC untuk Date
    // Buat object time di WIB lalu konversi ke UTC millis
    const wib = new Date(Date.UTC(year, month, day, hour, min, 0));
    // WIB = UTC+7, jadi kurangi 7 jam untuk dapat UTC yang benar
    const utcMillis = wib.getTime() - (7 * 60 * 60 * 1000);
    return new Date(utcMillis);
  } catch {
    return null;
  }
}

// Parse “x menit yang lalu”, “x jam yang lalu”, “kemarin”
function tryParseRelativeID(s = '') {
  try {
    const now = Date.now();
    const low = s.toLowerCase().trim();

    if (low.includes('kemarin')) {
      // asumsikan ~24 jam lalu
      return new Date(now - 24 * 60 * 60 * 1000);
    }

    const mMenit = low.match(/(\d+)\s*menit/);
    if (mMenit) {
      const mins = Number(mMenit[1]);
      return new Date(now - mins * 60 * 1000);
    }

    const mJam = low.match(/(\d+)\s*jam/);
    if (mJam) {
      const hours = Number(mJam[1]);
      return new Date(now - hours * 60 * 60 * 1000);
    }

    const mDetik = low.match(/(\d+)\s*detik/);
    if (mDetik) {
      const secs = Number(mDetik[1]);
      return new Date(now - secs * 1000);
    }

    const mHari = low.match(/(\d+)\s*hari/);
    if (mHari) {
      const days = Number(mHari[1]);
      return new Date(now - days * 24 * 60 * 60 * 1000);
    }

    return null;
  } catch {
    return null;
  }
}

// Ambil nama sumber yang valid atau null
function resolveSourceName(raw = '') {
  const key = (raw || '').toLowerCase().trim();
  if (SOURCES[key]) return key;
  return null;
}

// Ambil teks pesan
function getTextFromMessage(message) {
  return (
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    ''
  );
}

/* =======================
   UTAMA
======================= */
module.exports = async function newsCommand(sock, chatId, message) {
  const text = getTextFromMessage(message);
  const args = (text || '').trim().split(/\s+/);
  // cari keyword setelah .news
  // contoh ".news cnbc"
  let srcKey = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i].toLowerCase() === '.news' && args[i + 1]) {
      srcKey = resolveSourceName(args[i + 1]);
      break;
    }
    // fallback: kalau user kirim "news cnbc" tanpa titik
    if (args[i].toLowerCase() === 'news' && args[i + 1]) {
      srcKey = resolveSourceName(args[i + 1]);
      break;
    }
  }

  // kalau tidak spesifik: kirim bantuan
  if (!srcKey) {
    const available = Object.keys(SOURCES)
      .map(k => `- \`.news ${k}\` — ${SOURCES[k].name}`)
      .join('\n');

    const help = [
      '╭─〔 📰 *BERITA* 〕',
      '│ Gunakan perintah:',
      '│',
      available.split('\n').map(x => `│ ${x}`).join('\n'),
      '│',
      '│ Contoh: `.news cnn`',
      '╰────────────────────────'
    ].join('\n');

    return await sock.sendMessage(
      chatId,
      { text: help, ...(baseChannelInfo?.contextInfo ? { contextInfo: baseChannelInfo.contextInfo } : {}) },
      { quoted: message }
    );
  }

  const source = SOURCES[srcKey];

  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);

    const { data } = await axios.get(source.url, {
      timeout: 15000,
      headers: { accept: '*/*' }
    });

    const ok = data && data.status === true && Array.isArray(data.data);
    if (!ok || data.data.length === 0) {
      const txt = `😕 Belum ada berita dari *${source.name}* yang bisa ditampilkan.`;
      return await sock.sendMessage(
        chatId,
        { text: txt, ...(baseChannelInfo?.contextInfo ? { contextInfo: baseChannelInfo.contextInfo } : {}) },
        { quoted: message }
      );
    }

    const items = data.data.slice(0, MAX_ITEMS).map(source.pick);
    const fetchedAt =
      formatWIB(
        String(data.timestamp || '')
          .replace('T', ' ')
          .replace('Z', '')
      ) || '-';

    // Header
    const lines = [];
    lines.push('╭─〔 📰 *BERITA TERBARU* 〔Andika Bot〕 〕');
    lines.push(`│ 🏷️ Sumber : *${source.name}*`);
    lines.push(`│ 🕒 Diambil : *${fetchedAt}*`);
    lines.push('╰────────────────────────────────');

    // Isi
    items.forEach((it, idx) => {
      const title = it.title || '(Tanpa judul)';
      const cat = it.category || 'Umum';
      const when = formatWIB(it.dateRaw || '') || '-';
      const url = it.link || it.image || '';

      lines.push('');
      lines.push(`*${idx + 1}. ${title}*`);
      lines.push(`   🏷️ ${cat}   •   🕒 ${when}`);
      if (url) lines.push(`   🔗 ${url}`);
    });

    // Footer
    lines.push('');
    lines.push('🧭 *Tips:* Coba sumber lain: `.news cnbc`, `.news kompas`, `.news merdeka`, `.news sindonews`.');

    const msg = lines.join('\n');
    await sock.sendMessage(
      chatId,
      { text: msg, ...(baseChannelInfo?.contextInfo ? { contextInfo: baseChannelInfo.contextInfo } : {}) },
      { quoted: message }
    );
  } catch (err) {
    console.error('[news] error:', err?.response?.data || err?.message || err);
    const prettyErr = [
      `❌ *Gagal mengambil berita ${source.name}.*`,
      '',
      'Silakan coba lagi beberapa saat lagi atau ganti sumber:',
      '• `.news cnbc`',
      '• `.news kompas`',
      '• `.news merdeka`',
      '• `.news sindonews`'
    ].join('\n');
    await sock.sendMessage(
      chatId,
      { text: prettyErr, ...(baseChannelInfo?.contextInfo ? { contextInfo: baseChannelInfo.contextInfo } : {}) },
      { quoted: message }
    );
  }
};
