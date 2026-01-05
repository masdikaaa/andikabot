// commands/sholat.js
// Jadwal sholat & auto-adzan (audio lokal) — TANPA OFFSET, realtime per kota

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// ===== Channel badge (forwarded from channel) =====
let channelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg?.channelInfo) channelInfo = cfg.channelInfo;
} catch {}
if (!channelInfo.contextInfo) {
  channelInfo = {
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421594431163@newsletter', // ganti kalau perlu
        newsletterName: 'Andika Bot',
        serverMessageId: -1
      }
    }
  };
}

// ===== File store =====
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'sholatSettings.json');
// { groups: { [jid]: { enabled, adzan, cityId, cityName, tz, today:{date,times}, lastTrig:{}, lastFetch:number } }, citiesCache:{ts,data:[]} }

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE)) {
    fs.writeFileSync(STORE, JSON.stringify({ groups: {}, citiesCache: null }, null, 2));
  }
}
function readStore() {
  ensureStore();
  try {
    const j = JSON.parse(fs.readFileSync(STORE, 'utf8') || '{}');
    if (!j.groups) j.groups = {};
    return j;
  } catch {
    return { groups: {}, citiesCache: null };
  }
}
function writeStore(obj) {
  ensureStore();
  try { fs.writeFileSync(STORE, JSON.stringify(obj, null, 2)); } catch {}
}

// ===== Helpers waktu =====
function nowInTZ(tz = 'Asia/Jakarta') {
  const d = new Date();
  const s = d.toLocaleString('sv-SE', { timeZone: tz }); // "YYYY-MM-DD HH:mm:ss"
  const [date, time] = s.split(' ');
  return { date, time: time.slice(0,5), full: s };
}
function to24h(str) {
  const m = String(str||'').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2,'0')}:${m[2]}`;
}
const NAME_MAP = {
  subuh:'fajr', shubuh:'fajr', fajr:'fajr', imsak:'imsak',
  dzuhur:'dhuhr', zuhur:'dhuhr', dhuhr:'dhuhr',
  ashar:'asr', asr:'asr',
  maghrib:'maghrib', isya:'isha', isha:'isha',
  sunrise:'sunrise', terbit:'sunrise'
};
const ID_TITLE = { imsak:'Imsak', fajr:'Subuh', dhuhr:'Dzuhur', asr:'Ashar', maghrib:'Maghrib', isha:'Isya', sunrise:'Terbit' };

// ===== API MyQuran =====
const CITY_API = 'https://api.myquran.com/v2/sholat/kota/semua';

function normalize(s='') {
  return s.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
function escapeReg(s='') {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchCities() {
  const store = readStore();
  const now = Date.now();
  if (store.citiesCache && (now - store.citiesCache.ts < 1000*60*60*24)) {
    return store.citiesCache.data;
  }
  const res = await fetch(CITY_API, { headers:{accept:'application/json'} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const list = (j?.data||[]).map(x=>{
    const nlc = normalize(String(x.lokasi||''));
    const tokens = nlc.split(/[\s-]+/g).filter(Boolean);
    return { id:x.id, lokasi:x.lokasi, lokasi_norm:nlc, tokens };
  });
  const st = readStore();
  st.citiesCache = { ts: now, data: list };
  writeStore(st);
  return list;
}

/**
 * Cari kota: exact → whole-word → startsWith/endsWith → regex bound → contains (hindari "pemalang" saat cari "malang")
 */
async function findCityByName(name) {
  const keyRaw = String(name||'').trim();
  if (!keyRaw) return null;

  // Kalau kirim ID numerik
  if (/^\d+$/.test(keyRaw)) {
    const list = await fetchCities();
    return list.find(x=>String(x.id)===keyRaw) || null;
  }

  const key = normalize(keyRaw);
  const list = await fetchCities();

  // 1) exact
  let exact = list.find(x=>x.lokasi_norm === key);
  if (exact) return exact;

  // 2) whole-word
  let word = list.find(x=>x.tokens.includes(key));
  if (word) return word;

  // 3) startsWith / endsWith
  let sw = list.find(x=>x.lokasi_norm.startsWith(key + ' '));
  if (!sw) sw = list.find(x=>x.lokasi_norm.endsWith(' ' + key));
  if (!sw) sw = list.find(x=>x.lokasi_norm === key);
  if (sw) return sw;

  // 4) regex bound
  const re = new RegExp(`(?:^|[\\s-])${escapeReg(key)}(?:$|[\\s-])`, 'i');
  let bound = list.find(x=>re.test(x.lokasi_norm));
  if (bound) return bound;

  // 5) contains (dengan boundary check — cegah "peMALANG")
  let contains = list.find(x=>x.lokasi_norm.includes(key));
  if (contains) {
    const i = contains.lokasi_norm.indexOf(key);
    const before = contains.lokasi_norm[i-1];
    const after  = contains.lokasi_norm[i+key.length];
    const boundaryBefore = !before || /[\s-]/.test(before);
    const boundaryAfter  = !after  || /[\s-]/.test(after);
    if (boundaryBefore && boundaryAfter) return contains;
  }

  return null;
}

async function fetchTodayByCityId(cityId, tz) {
  const { date } = nowInTZ(tz);
  const [Y,M,D] = date.split('-');
  const url = `https://api.myquran.com/v2/sholat/jadwal/${encodeURIComponent(cityId)}/${Y}/${M}/${D}`;
  const res = await fetch(url, { headers:{accept:'application/json'} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const dt = j?.data?.jadwal || {};
  const map = {
    imsak   : to24h(dt.imsak),
    sunrise : to24h(dt.terbit || dt.sunrise),
    fajr    : to24h(dt.subuh || dt.fajr),
    dhuhr   : to24h(dt.dzuhur || dt.dhuhr),
    asr     : to24h(dt.ashar || dt.asr),
    maghrib : to24h(dt.maghrib),
    isha    : to24h(dt.isya || dt.isha),
  };
  return { date, times: map, raw: dt };
}

// ===== Audio lokal (pindah ke folder sound/) =====
const SOUND_DIR = path.join(__dirname, '..', 'sound');
const LOCAL_AUDIO = {
  fajr:     path.join(SOUND_DIR, 'adzan-subuh.mp3'),
  dhuhr:    path.join(SOUND_DIR, 'adzan-dhuhur-isya.mp3'),
  asr:      path.join(SOUND_DIR, 'adzan-dhuhur-isya.mp3'),
  maghrib:  path.join(SOUND_DIR, 'adzan-dhuhur-isya.mp3'),
  isha:     path.join(SOUND_DIR, 'adzan-dhuhur-isya.mp3'),
  // ⚠️ Tidak ada entry untuk imsak (imsak hanya notif teks)
};

// ===== Kirim adzan + teks (AUTO, TANPA REPLY) =====
async function sendAdzan(sock, jid, which, cfg) {
  const title = ID_TITLE[which] || which;
  const timeStr = cfg.today?.times?.[which] || '-';
  const header =
`🕌 *Pengingat Sholat* — *${cfg.cityName || 'Kota?'}*
${which==='imsak'?'🍽️':'🕒'} *${title}* • ${timeStr}
🌏 Zona: _${cfg.tz || 'Asia/Jakarta'}_`;

  // Imsak: notif teks saja
  if (which === 'imsak') {
    await sock.sendMessage(
      jid,
      { text: `🔔 ${header}`, ...channelInfo },
      {}           // ⬅️ tidak ada quoted → bukan reply
    );
    return;
  }

  // Sholat 5 waktu: audio + teks jika adzan ON, jika OFF teks saja
  if (cfg.adzan === false) {
    await sock.sendMessage(
      jid,
      { text: `🔔 ${header}`, ...channelInfo },
      {}         // ⬅️ bukan reply
    );
    return;
  }

  const filePath =
    (which === 'fajr' && LOCAL_AUDIO.fajr) ? LOCAL_AUDIO.fajr :
    LOCAL_AUDIO[which] || LOCAL_AUDIO.dhuhr;

  try {
    if (!fs.existsSync(filePath)) {
      console.error('[SHOLAT] File audio TIDAK ADA:', filePath);
      await sock.sendMessage(
        jid,
        {
          text: `🔔 ${header}\n\n(⚠️ Audio tidak ditemukan di path berikut:\n${filePath})`,
          ...channelInfo
        },
        {}       // ⬅️ bukan reply
      );
      return;
    }
    const buf = fs.readFileSync(filePath);
    await sock.sendMessage(
      jid,
      { audio: buf, mimetype: 'audio/mpeg', ptt: false, ...channelInfo },
      {}         // ⬅️ bukan reply
    );
    await sock.sendMessage(
      jid,
      { text: header, ...channelInfo },
      {}         // ⬅️ bukan reply
    );
  } catch (err) {
    console.error('[SHOLAT] Gagal kirim audio:', filePath, err);
    await sock.sendMessage(
      jid,
      {
        text: `🔔 ${header}\n\n(⚠️ Gagal memutar audio: ${path.basename(filePath)})`,
        ...channelInfo
      },
      {}       // ⬅️ bukan reply
    );
  }
}

// ===== Scheduler =====
let _interval = null;
const REFRESH_MS = 15 * 60 * 1000; // refresh jadwal maksimal tiap 15 menit

async function ensureTodayForGroup(groupCfg) {
  const tz = groupCfg.tz || 'Asia/Jakarta';
  const { date } = nowInTZ(tz);
  const st = readStore();

  const needFetch =
    !groupCfg.today ||
    groupCfg.today?.date !== date ||
    !groupCfg.lastFetch ||
    (Date.now() - groupCfg.lastFetch > REFRESH_MS);

  if (!groupCfg.cityId) return null;
  if (!needFetch) return groupCfg.today;

  try {
    const today = await fetchTodayByCityId(groupCfg.cityId, tz);
    groupCfg.today = today;
    groupCfg.lastTrig = groupCfg.lastTrig || {};
    groupCfg.lastFetch = Date.now();
    st.groups[groupCfg.jid] = groupCfg;
    writeStore(st);
    return today;
  } catch {
    return groupCfg.today || null;
  }
}

function shouldTriggerAt(nowHHmm, schHHmm) {
  return schHHmm && nowHHmm === schHHmm;
}

async function tick(sock) {
  const st = readStore();
  for (const [jid, cfgRaw] of Object.entries(st.groups || {})) {
    const cfg = { ...cfgRaw, jid };
    if (!cfg.enabled) continue;

    const tz = cfg.tz || 'Asia/Jakarta';
    const { date, time } = nowInTZ(tz);

    const today = await ensureTodayForGroup(cfg);
    if (!today || today.date !== date) continue;

    const times = today.times || {};
    const plan = ['imsak','fajr','dhuhr','asr','maghrib','isha']; // Imsak ikut, tapi hanya notif teks

    for (const key of plan) {
      const tSch = times[key];
      if (!tSch) continue;
      const last = cfg.lastTrig?.[key] || '';
      if (shouldTriggerAt(time, tSch) && last !== `${date} ${tSch}`) {
        cfg.lastTrig = cfg.lastTrig || {};
        cfg.lastTrig[key] = `${date} ${tSch}`;
        const st2 = readStore();
        st2.groups[jid] = cfg; writeStore(st2);
        try { await sendAdzan(sock, jid, key, cfg); } catch {}
      }
    }
  }
}

function initSholatScheduler(sock) {
  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => tick(sock), 20 * 1000); // cek tiap 20 detik
}

// ===== Command =====
function usage() {
  return (
`🕌 *Sholat Bot*
${'┏━━━━━━━━━━━━━━━━━━━━━━━'}
┃ • *.sholat on/off*
┃ • *.sholat status*
┃ • *.sholat setcity <kota>*
┃ • *.sholat tz <IANA TZ>*
┃ • *.sholat adzan on/off*
┃ • *.sholat schedule <kota>*
${'┗━━━━━━━━━━━━━━━━━━━━━━━'}

Contoh:
• .sholat schedule jakarta
• .sholat setcity malang
• .sholat tz Asia/Makassar
• .sholat on`
  );
}

function prettyTimes(t) {
  return [
    `🌅 *Imsak*   : ${t.imsak || '-'}`,
    `🌄 *Subuh*   : ${t.fajr || '-'}`,
    `🏞️ *Dzuhur*  : ${t.dhuhr || '-'}`,
    `🌇 *Ashar*   : ${t.asr || '-'}`,
    `🌆 *Maghrib* : ${t.maghrib || '-'}`,
    `🌃 *Isya*    : ${t.isha || '-'}`,
  ].join('\n');
}

async function sholatCommand(sock, chatId, message) {
  const raw = (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption ||
    ''
  ).trim();

  const args = raw.split(/\s+/).slice(1);
  const sub = (args[0] || '').toLowerCase();

  const st = readStore();
  const g = st.groups[chatId] || { enabled:false, adzan:true, tz:'Asia/Jakarta' };
  g.jid = chatId;

  // Command manual: SELALU reply ke pesan command
  const reply = (text) =>
    sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });

  if (!sub) return reply(usage());

  if (sub === 'on' || sub === 'off') {
    g.enabled = (sub === 'on');
    st.groups[chatId] = g; writeStore(st);
    await reply(`${g.enabled ? '✅' : '⛔'} *Reminder sholat* untuk chat ini: *${g.enabled ? 'ON' : 'OFF'}*`);
    return;
  }

  if (sub === 'status') {
    await ensureTodayForGroup(g);
    st.groups[chatId] = g; writeStore(st);

    const modeInfo = `⚙️ *Mode* : ${g.enabled ? 'ON' : 'OFF'}\n`;
    const cityInfo = g.cityName ? `🏙️ *Kota* : ${g.cityName} (id: ${g.cityId||'-'})\n` : '🏙️ *Kota* : _Belum diset_\n';
    const tzInfo   = `🌏 *Zona* : ${g.tz || 'Asia/Jakarta'}\n`;
    const jadwal   = g.today?.times ? prettyTimes(g.today.times) : '• _Jadwal hari ini belum dimuat (set city & ON)._' ;

    await reply(
`📊 *Status Sholat*
${modeInfo}${cityInfo}${tzInfo}🔊 *Adzan* : ${g.adzan === false ? 'OFF' : 'ON'}
${'─'.repeat(26)}
${jadwal}`
    );
    return;
  }

  if (sub === 'setcity') {
    const name = args.slice(1).join(' ').trim();
    if (!name) return reply('🔎 *Contoh:* `.sholat setcity jakarta`');
    try {
      const found = await findCityByName(name);
      if (!found) {
        return reply(`❌ Kota *${name}* tidak ditemukan.\nCoba nama lain atau lebih spesifik, misal: *kota malang* / *kab malang*.`);
      }
      g.cityId = found.id;
      g.cityName = found.lokasi;
      g.lastFetch = 0; // paksa refresh
      await ensureTodayForGroup(g);
      st.groups[chatId] = g; writeStore(st);

      const jadwal = g.today?.times ? `\n${prettyTimes(g.today.times)}` : '';
      await reply(
`✅ Kota di-set: *${g.cityName}* (id: ${g.cityId})
🕒 Jadwal diambil *realtime* dari *MyQuran*.
Gunakan *.sholat on* untuk mengaktifkan pengingat.${jadwal}`
      );
    } catch {
      await reply('❌ Gagal mencari kota.');
    }
    return;
  }

  if (sub === 'tz') {
    const tz = args[1] || '';
    if (!tz) return reply('🕒 Contoh: `.sholat tz Asia/Makassar`');
    g.tz = tz;
    g.today = null; // refresh total
    g.lastFetch = 0;
    st.groups[chatId] = g; writeStore(st);
    await reply(`✅ Zona waktu di-set: *${tz}* (jadwal akan di-refresh)`);
    return;
  }

  if (sub === 'adzan') {
    const v = (args[1] || '').toLowerCase();
    if (!['on','off'].includes(v)) return reply('🔊 *Contoh:* `.sholat adzan on` atau `.sholat adzan off`');
    g.adzan = (v === 'on');
    st.groups[chatId] = g; writeStore(st);
    await reply(`🔊 Audio adzan: *${g.adzan ? 'ON' : 'OFF'}*`);
    return;
  }

  // schedule / scehdule (typo-friendly)
  if (sub === 'schedule' || sub === 'scehdule') {
    const qCity = args.slice(1).join(' ').trim();
    const tz = g.tz || 'Asia/Jakarta';

    let target = null;
    try {
      if (qCity) {
        target = await findCityByName(qCity);
        if (!target) return reply(`❌ Kota *${qCity}* tidak ditemukan.`);
      } else if (g.cityId) {
        target = { id: g.cityId, lokasi: g.cityName || 'Kota tersimpan' };
      } else {
        // default: Jakarta
        target = await findCityByName('jakarta');
      }

      const today = await fetchTodayByCityId(target.id, tz);
      return reply(
`🕌 *Jadwal Sholat — ${target.lokasi}*
🗓️ ${today.date} • 🌏 ${tz}

${prettyTimes(today.times)}`
      );
    } catch {
      return reply('⚠️ Gagal mengambil jadwal. Coba lagi sebentar.');
    }
  }

  return reply(usage());
}

// ===== Export =====
module.exports = {
  initSholatScheduler,
  sholatCommand
};
