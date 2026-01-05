// commands/domain.js
const fetch = require('node-fetch');

/* ========== Channel info (opsional) ========== */
let channelInfo = {};
try {
  const mod = require('../lib/messageConfig');
  if (mod && mod.channelInfo) channelInfo = mod.channelInfo;
} catch {}

/* ========== Helpers ========== */
const isProbablyDomain = (s = '') =>
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i
    .test(String(s).trim());

const cleanDomain = (input = '') =>
  String(input)
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/i, '')
    .replace(/\/+.*$/, '')
    .toLowerCase();

function extractText(message) {
  const m = message?.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const AC = global.AbortController || (await import('abort-controller')).default;
  const controller = new AC();
  const t = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(t); }
}

/* ========== UI ========== */
// Header kotak: tanpa sisi kanan, judul & domain ada di dalam kotak
function renderResult(domain, d) {
  const tz = d.timezone || {};
  const lat = d.latitude;
  const lon = d.longitude;
  const mapsShort = (lat != null && lon != null)
    ? `https://maps.google.com/?q=${lat},${lon}` : null;

  // lebar kotak jangan kepanjangan biar gak bungkus
  const WIDTH = 34; // tweak kalau mau
  const top = '┏' + '━'.repeat(WIDTH);
  const title = '┃  *CEK DOMAIN*';
  const domLine = `┃  🔎 ${domain}`;
  const bottom = '┗' + '━'.repeat(WIDTH);

  const lines = [
    top,
    title,
    domLine,
    bottom,
    `🧾 *Type*   : ${d.type || '—'}`,
    `📡 *IP*     : ${d.ip || '—'}`,
    `🏢 *ISP*    : ${d.isp || '—'}`,
    `🏭 *Org*    : ${d.org || '—'}`,
    `🧬 *ASN*    : ${d.asn != null ? d.asn : '—'}`,
    `🌍 *Negara* : ${d.country || '—'}`,
    `🏙️ *Region* : ${d.region || '—'}`,
    `🏘️ *Kota*   : ${d.city || '—'}`,
    `🕒 *Zona*   : ${tz.id || tz.abbr || tz.utc || '—'}`,
    `⌚ *Waktu*  : ${tz.current_time || '—'}`,
    `📍 *Koord*  : ${(lat != null && lon != null) ? `${lat}, ${lon}` : '—'}`,
    mapsShort ? `🗺️ *Maps*  : ${mapsShort}` : null,
    '',
    '✅ *Status*: Ditemukan'
  ].filter(Boolean);

  return lines.join('\n');
}

/* ========== Command ========== */
/**
 * .domain masdika.id
 * .cekdomain google.com
 * .whois cloudflare.com
 * (bisa juga reply teks berisi domain)
 */
async function domainCommand(sock, chatId, message) {
  try {
    const raw = extractText(message);
    const lower = raw.toLowerCase();

    // ambil argumen
    let domainArg = '';
    if (lower.startsWith('.domain') || lower.startsWith('.cekdomain') || lower.startsWith('.whois')) {
      domainArg = raw.split(/\s+/).slice(1).join(' ').trim();
    }
    if (!domainArg) {
      const q = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const qText =
        q?.conversation ||
        q?.extendedTextMessage?.text ||
        q?.imageMessage?.caption ||
        q?.videoMessage?.caption ||
        '';
      if (qText) domainArg = qText.trim();
    }

    const domain = cleanDomain(domainArg);
    if (!domain || !isProbablyDomain(domain)) {
      await sock.sendMessage(
        chatId,
        {
          text: '⚠️ *Format salah.*\nKetik: *.domain namadomain.tld*\nContoh: *.domain google.com*',
          ...channelInfo,
          linkPreview: { isDisabled: true }
        },
        { quoted: message }
      );
      return;
    }

    // Endpoint pakai ?q=
    const url = `https://zelapioffciall.koyeb.app/tools/domain?q=${encodeURIComponent(domain)}`;
    const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 15000);

    if (!res.ok) {
      await sock.sendMessage(
        chatId,
        { text: '❌ *Gagal menghubungi layanan cek domain.* Coba lagi nanti.', ...channelInfo, linkPreview: { isDisabled: true } },
        { quoted: message }
      );
      return;
    }

    const data = await res.json();
    if (!data || (!data.status && !data.success)) {
      await sock.sendMessage(
        chatId,
        { text: `❌ *Domain tidak dapat dicek atau tidak valid.*\nCoba periksa kembali: *${domain}*`, ...channelInfo, linkPreview: { isDisabled: true } },
        { quoted: message }
      );
      return;
    }

    const text = renderResult(domain, data);
    await sock.sendMessage(
      chatId,
      { text, ...channelInfo, linkPreview: { isDisabled: true } },
      { quoted: message }
    );
  } catch (err) {
    console.error('domainCommand error:', err);
    await sock.sendMessage(
      chatId,
      { text: '❌ *Terjadi kesalahan saat cek domain.* Silakan coba lagi beberapa saat.', ...channelInfo, linkPreview: { isDisabled: true } },
      { quoted: message }
    );
  }
}

module.exports = { domainCommand };
