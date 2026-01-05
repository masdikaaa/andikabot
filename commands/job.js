// commands/job.js
const fetch = require('node-fetch');

/** ===== Channel info biar muncul forwarded channel badge ===== */
const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363421594431163@newsletter', // ganti kalau channel ID beda
      newsletterName: 'Andika Bot',
      serverMessageId: -1
    }
  }
};

/** ===== Helpers ===== */
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function getRandomDelay(){ return 800 + Math.floor(Math.random()*900); } // 0.8–1.7s

async function showTyping(sock, chatId){
  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(getRandomDelay());
  } catch {}
}

function chunkText(s, max=3500){
  const out = [];
  let i=0;
  while (i<s.length) {
    out.push(s.slice(i, i+max));
    i += max;
  }
  return out;
}

/** Ambil ".job it support malang" => q="it support", city="malang" */
function parseArgsSimple(raw) {
  const txt = (raw || '').trim();
  if (!txt) return { q: '', city: '' };

  // deteksi kota di akhir kalimat (1 atau 2 kata, ex: jakarta, jakarta barat)
  const cityMatch = txt.match(/(.+)\s+([a-zA-Z]+(?:\s+(timur|barat|utara|selatan))?)$/i);
  if (!cityMatch) return { q: '', city: '' };

  const q = cityMatch[1].trim();
  const city = cityMatch[2].trim();
  return { q, city };
}

function formatItem(it, idx) {
  const ttl = it.title || '-';
  const comp = it.company || '-';
  const loc = it.location || '-';
  const date = it.date || '-';
  const salary = it.salary || 'Tidak dicantumkan';
  const desc = (it.description || '').trim();
  const shortDesc = desc.length > 350 ? desc.slice(0, 350) + '…' : desc;

  return (
`*${idx}. ${ttl}*
🏢 ${comp}
📍 ${loc}
🗓️ ${date}
💰 ${salary}
${shortDesc ? `\n${shortDesc}` : ''}

🔗 ${it.url || '-'}`
  ).trim();
}

function buildHeader(q, city, total) {
  return (
`*『 🔎 JOB SEARCH 』*
*Keyword:* ${q}
*Kota:* ${city}
*Hasil:* ${total}
━━━━━━━━━━━━━━`
  );
}

/** ===== Main command ===== */
async function jobCommand(sock, chatId, message, rawArgs) {
  try {
    if (!chatId) return;

    await showTyping(sock, chatId);

    // parse: ".job it support malang"
    const { q, city } = parseArgsSimple(rawArgs);
    if (!q || !city) {
      await sock.sendMessage(chatId, {
        text:
`📋 *Cara Pakai Fitur Job Search*
Gunakan format berikut:

*.job <keyword> <kota>*

🧩 *Contoh:*
• .job devops jakarta
• .job it support malang
• .job full stack developer bandung barat`,
        ...channelInfo
      }, { quoted: message });
      return;
    }

    const url = `https://zelapioffciall.koyeb.app/search/loker?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`;

    // retry ringan 2x kalau error
    let data = null;
    for (let i=0;i<2;i++){
      try {
        const res = await fetch(url, { method:'GET', headers:{ accept:'application/json' }});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (e) {
        if (i === 1) throw e;
        await sleep(500 + Math.random()*600);
      }
    }

    if (!data || data.status !== true || !Array.isArray(data.result)) {
      await sock.sendMessage(chatId, { text: `⚠️ Tidak bisa mengambil data lowongan sekarang. Coba lagi ya.`, ...channelInfo }, { quoted: message });
      return;
    }

    if (data.result.length === 0) {
      await sock.sendMessage(chatId, { text: `🙁 Tidak ditemukan hasil untuk *${q}* di *${city}*.`, ...channelInfo }, { quoted: message });
      return;
    }

    // ambil maksimal 30 biar gak kepanjangan
    const items = data.result.slice(0, 30);

    const header = buildHeader(q, city, data.result.length);
    const body = items.map((it, i) => formatItem(it, i+1)).join('\n\n────────────────\n\n');
    const full = `${header}\n\n${body}`;

    const chunks = chunkText(full, 3500);
    for (let i=0;i<chunks.length;i++){
      const prefix = (chunks.length > 1) ? `(${i+1}/${chunks.length})\n\n` : '';
      await sock.sendMessage(chatId, { text: prefix + chunks[i], ...channelInfo }, { quoted: message });
      if (i < chunks.length - 1) await sleep(350);
    }

    try { await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }); } catch {}

  } catch (err) {
    console.error('jobCommand error:', err);
    await sock.sendMessage(chatId, { text: '❌ Gagal memproses pencarian pekerjaan.', ...channelInfo }, { quoted: message });
  } finally {
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
  }
}

module.exports = { jobCommand };
