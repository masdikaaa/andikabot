// commands/gempa.js
const axios = require('axios');

const API_URL = 'https://zelapioffciall.koyeb.app/info/cekgempa';

let channelInfo = {};
try {
  ({ channelInfo } = require('../lib/messageConfig'));
} catch (_) {
  channelInfo = {};
}

// Deteksi apakah string waktu ini ISO/epoch yang bisa diparse JS
function isParsableDate(str) {
  if (!str) return false;
  // angka murni (epoch) atau ISO-like
  if (/^\d+$/.test(str)) return true;
  // contoh: 2025-10-02T12:59:17Z atau 2025/10/02 12:59:17
  return /\d{4}[-/]\d{2}[-/]\d{2}/.test(str);
}

// Format waktu untuk caption:
// - Jika string lokal (mis: "02 Okt 2025 12:59:17 WIB"), tampilkan apa adanya
// - Jika ISO/epoch, format ke WIB
function prettyTime(raw) {
  if (!raw) return '-';
  if (typeof raw === 'string' && !isParsableDate(raw)) {
    // Sudah format lokal (BMKG) → tampilkan langsung
    return raw;
  }
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
    }
  } catch {}
  // fallback terakhir
  return String(raw);
}

// helper pilih key
function pick(obj, keys, def = '') {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return def;
}

// Normalisasi berbagai bentuk respons
function normalizeQuake(json) {
  const root = json?.data || json?.result || json || {};
  const q = root.gempa || root.latest || root;
  const quake = Array.isArray(q) ? q[0] : q;

  const waktu = pick(quake, ['waktu', 'tanggal', 'time', 'date', 'datetime']);
  const magnitude = pick(quake, ['magnitude', 'mag', 'magnitude_value', 'm']);
  const kedalaman = pick(quake, ['kedalaman', 'depth', 'depth_km']);
  const lokasi = pick(quake, ['lokasi', 'wilayah', 'region', 'place', 'area']);
  const koordinat = pick(quake, ['koordinat', 'coordinates', 'coord', 'lintang_bujur']);
  const potensi = pick(quake, ['potensi', 'warning', 'tsunami']);
  const dirasakan = pick(quake, ['dirasakan', 'felt', 'felt_reports']);
  const shakemap =
    pick(quake, ['peta', 'shakemap', 'map', 'map_url', 'image', 'image_url']) ||
    pick(root, ['peta', 'shakemap', 'map']);

  return { waktu, magnitude, kedalaman, lokasi, koordinat, potensi, dirasakan, shakemap };
}

async function fetchQuake() {
  const res = await axios.get(API_URL, {
    timeout: 20000,
    headers: { Accept: 'application/json,*/*;q=0.8' }
  });

  let data = res.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch {}
  }
  return normalizeQuake(data);
}

function buildCaption(q) {
  const parts = [];
  parts.push('🌋 *Info Gempa Terkini*');
  parts.push('');
  parts.push(`🕒 *Waktu:* ${prettyTime(q.waktu)}`);
  if (q.lokasi) parts.push(`📍 *Lokasi:* ${q.lokasi}`);
  if (q.koordinat) parts.push(`🗺️ *Koordinat:* ${q.koordinat}`);
  if (q.magnitude) parts.push(`📏 *Magnitudo:* ${q.magnitude}`);
  if (q.kedalaman) parts.push(`📉 *Kedalaman:* ${q.kedalaman}${/km/i.test(q.kedalaman) ? '' : ' km'}`);
  if (q.potensi) parts.push(`⚠️ *Potensi:* ${q.potensi}`);
  if (q.dirasakan) parts.push(`👥 *Dirasakan:* ${q.dirasakan}`);
  parts.push('');
  parts.push('_Sumber: BMKG (via API)_');
  return parts.join('\n');
}

async function gempaCommand(sock, chatId, message) {
  try {
    const quake = await fetchQuake();
    const caption = buildCaption(quake);

    if (quake.shakemap && /^https?:\/\//i.test(quake.shakemap)) {
      try {
        const img = await axios.get(quake.shakemap, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(
          chatId,
          { image: Buffer.from(img.data), caption, ...channelInfo },
          { quoted: message }
        );
        return;
      } catch {}
    }

    await sock.sendMessage(chatId, { text: caption, ...channelInfo }, { quoted: message });
  } catch (err) {
    console.error('Error gempaCommand:', err?.message || err);
    await sock.sendMessage(
      chatId,
      {
        text: '❌ *Gagal mengambil info gempa.* Coba lagi beberapa saat.',
        ...channelInfo
      },
      { quoted: message }
    );
  }
}

module.exports = { gempaCommand };
