// commands/weather.js — OpenWeather (current + besok) • versi fix jam lokal (Asia/Jakarta)
// by Andika Bot — FINAL v3 (2025-11-07)

'use strict';
const axios = require('axios');

// ===== Channel Info =====
let channelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg && cfg.channelInfo) channelInfo = cfg.channelInfo;
} catch {}
if (!channelInfo.contextInfo) {
  channelInfo = {
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

// ===== Constants & Helpers =====
const OPENWEATHER_KEY = '4902c0f2550f58298ad4146a92b65e10';
const round1 = (n) => (typeof n === 'number' && isFinite(n)) ? Math.round(n * 10) / 10 : '—';
const mps2kph = (mps) => (typeof mps === 'number') ? Math.round(mps * 3.6) : null;

function degToDir(deg) {
  const dirs = [
    ['N', '↑'], ['NNE', '↗'], ['NE', '↗'], ['ENE', '↗'],
    ['E', '→'], ['ESE', '↘'], ['SE', '↘'], ['SSE', '↘'],
    ['S', '↓'], ['SSW', '↙'], ['SW', '↙'], ['WSW', '↙'],
    ['W', '←'], ['WNW', '↖'], ['NW', '↖'], ['NNW', '↖']
  ];
  const i = Math.round(((deg % 360) / 22.5)) % 16;
  const [txt, arr] = dirs[i];
  return `${arr} ${txt}`;
}

// emoji cuaca
const EMOJI = { clear:'☀️', partly:'🌤️', cloud:'☁️', fog:'🌫️', drizzle:'🌦️', rain:'🌧️', snow:'🌨️', thunder:'⛈️', na:'⛅' };
function emojiFromDesc(d = '') {
  const s = d.toLowerCase();
  if (s.includes('thunder')) return EMOJI.thunder;
  if (s.includes('heavy')) return EMOJI.rain;
  if (s.includes('rain')) return EMOJI.drizzle;
  if (s.includes('snow')) return EMOJI.snow;
  if (s.includes('fog') || s.includes('kabut')) return EMOJI.fog;
  if (s.includes('cloud')) return EMOJI.cloud;
  if (s.includes('clear') || s.includes('cerah')) return EMOJI.clear;
  return EMOJI.na;
}

// ubah UTC ke waktu lokal Asia/Jakarta (manual offset)
function toJakartaTime(epochSec, offsetSecFromApi = 0) {
  const jakartaOffset = 7 * 3600; // +7 jam
  const adjusted = epochSec + offsetSecFromApi - jakartaOffset; // konversi relatif dari API ke WIB
  return new Date(adjusted * 1000);
}
function fmtDateJakarta(d) {
  return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday:'long', day:'2-digit', month:'short', year:'numeric' });
}
function fmtTimeJakarta(d) {
  return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour:'2-digit', minute:'2-digit', hour12:false });
}

// ===================== API Fetchers =====================
async function fetchCurrent(city) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_KEY}&units=metric&lang=id`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const tz = data.timezone || 0;

  return {
    place_pretty: data.name || city,
    tz_offset: tz,
    now: {
      temp_c: data.main?.temp,
      feels_c: data.main?.feels_like,
      temp_min: data.main?.temp_min,
      temp_max: data.main?.temp_max,
      humidity: data.main?.humidity,
      pressure_hpa: data.main?.pressure,
      clouds: data.clouds?.all,
      wind_kmh: mps2kph(data.wind?.speed),
      wind_deg: data.wind?.deg,
      vis_km: (data.visibility / 1000) || null,
      sunrise: toJakartaTime(data.sys?.sunrise, tz),
      sunset: toJakartaTime(data.sys?.sunset, tz),
      text: data.weather?.[0]?.description,
      icon: data.weather?.[0]?.icon,
      time: toJakartaTime(data.dt, tz)
    }
  };
}

async function fetchForecastTomorrow(city) {
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_KEY}&units=metric&lang=id`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const tz = data.city?.timezone || 0;
  const list = Array.isArray(data.list) ? data.list : [];

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = today.getTime() + 24*3600*1000;
  const end = start + 24*3600*1000;

  const besokSlots = list.filter(it => {
    const local = toJakartaTime(it.dt, tz).getTime();
    return local >= start && local < end;
  });
  if (!besokSlots.length) return null;

  let min = +Infinity, max = -Infinity, popMax = 0;
  const descCount = {};
  for (const it of besokSlots) {
    if (it.main?.temp_min) min = Math.min(min, it.main.temp_min);
    if (it.main?.temp_max) max = Math.max(max, it.main.temp_max);
    if (typeof it.pop === 'number') popMax = Math.max(popMax, Math.round(it.pop * 100));
    const desc = it.weather?.[0]?.description || '—';
    descCount[desc] = (descCount[desc] || 0) + 1;
  }
  const domDesc = Object.entries(descCount).sort((a,b)=>b[1]-a[1])[0][0];
  return { min_c: min, max_c: max, chance_rain: popMax, text: domDesc };
}

// ===================== UI Builder =====================
function buildMessage(place, now, besok) {
  const emj = emojiFromDesc(now.text);
  const top = `┏━━〔 ${emj} CUACA • ${place} 〕━━┓`;
  const sep = `┠────────────────────────────`;
  const bot = `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;

  const windDir = now.wind_deg ? `${degToDir(now.wind_deg)} (${now.wind_deg}°)` : '—';

  const nowLines = [
    `┊ 🌡️ *Suhu*: ${round1(now.temp_c)}°C (terasa ${round1(now.feels_c)}°C)`,
    `┊ ⬇️ *Min*: ${round1(now.temp_min)}°C · ⬆️ *Max*: ${round1(now.temp_max)}°C`,
    `┊ 💧 *Lembap*: ${now.humidity}% · ⚖️ *Tekanan*: ${now.pressure_hpa} hPa`,
    now.clouds != null ? `┊ ☁️ *Awan*: ${now.clouds}%` : null,
    `┊ 🌬️ *Angin*: ${now.wind_kmh} km/jam ${windDir}`,
    `┊ 👁️ *Jarak Pandang*: ${now.vis_km} km`,
    `┊ 🌅 *Terbit*: ${fmtTimeJakarta(now.sunrise)} · 🌇 *Terbenam*: ${fmtTimeJakarta(now.sunset)}`,
    `┊ 🕒 *Data*: ${fmtDateJakarta(now.time)} • ${fmtTimeJakarta(now.time)} WIB`
  ].filter(Boolean);

  const b = besok;
  const bLines = b ? [
    `┊ 🔮 *Besok*: ${emojiFromDesc(b.text)} ${b.text}`,
    `┊ ⬇️ *Min*: ${round1(b.min_c)}°C · ⬆️ *Max*: ${round1(b.max_c)}°C`,
    `┊ ☔ *Peluang Hujan*: ${b.chance_rain}%`
  ] : ['┊ 🔮 *Besok*: —'];

  const watermark = `┊ 🔖 *Watermark*: Andika Bot • andikabot`;
  const sourceLine = `┊ 🛰️ *Sumber*: OpenWeather Realtime`;

  return [top, ...nowLines, sep, ...bLines, sep, sourceLine, watermark, bot].join('\n');
}

// ===================== Command Handler =====================
module.exports = async function (sock, chatId, message, city) {
  try {
    const q = String(city || '').trim();
    if (!q) {
      await sock.sendMessage(chatId, { text:
`┏━〔 ⚠️ Format Salah 〕━┓
┊ Pakai: *.weather NamaKota*
┊ Contoh: *.weather Surabaya*
┗━━━━━━━━━━━━━━━━━━━━┛`, ...channelInfo }, { quoted: message });
      return;
    }

    const cur = await fetchCurrent(q);
    let besok = null;
    try { besok = await fetchForecastTomorrow(q); } catch {}

    const text = buildMessage(cur.place_pretty, cur.now, besok);
    await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

  } catch (error) {
    console.error('[weather]', error?.message || error);
    const status = error?.response?.status;
    const msg = status === 404 ? 
`┏━〔 ⚠️ Lokasi Tidak Ditemukan 〕━┓
┊ Coba eja lebih spesifik.
┗━━━━━━━━━━━━━━━━━━━━┛` :
status === 401 ?
`┏━〔 ⚠️ API Key Salah 〕━┓
┊ Periksa OPENWEATHER_KEY.
┗━━━━━━━━━━━━━━━━━━━━┛` :
`┏━〔 ⚠️ Gagal Ambil Cuaca 〕━┓
┊ Coba lagi beberapa saat.
┗━━━━━━━━━━━━━━━━━━━━┛`;
    await sock.sendMessage(chatId, { text: msg, ...channelInfo }, { quoted: message });
  }
};
