// commands/claude.js
const fetch = require('node-fetch');

/** ========= THEME / BRAND ========= */
const BRAND = 'Andika Bot';
const ICON = { bot: '🤖', tip: '✨', err: '❌' };
const HEAD = (title) =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

/** ===== Channel badge (forwarded from channel) ===== */
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

/** ===== Helpers ===== */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function showTyping(sock, chatId){
  try {
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);
    await sleep(500);
  } catch {}
}
const react = (sock, chatId, key, text) =>
  sock.sendMessage(chatId, { react: { text, key } }).catch(() => {});

function getArgsFrom(message, rawAfterCmd='') {
  const direct = rawAfterCmd.trim();
  if (direct) return direct;
  const q =
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption ||
    message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.caption ||
    '';
  return (q || '').trim();
}

function chunkText(s, max = 3800) {
  s = String(s || '');
  const out = [];
  while (s.length > max) {
    let cut = s.lastIndexOf('\n', max);
    if (cut < max * 0.6) cut = max;
    out.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  if (s) out.push(s);
  return out;
}

function normalizeText(str) {
  if (typeof str !== 'string') str = String(str ?? '');
  str = str.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\\t/g, '  ').replace(/\r/g, '');
  return str.replace(/\n{3,}/g, '\n\n').trim();
}

function extractAnswerFromJson(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  const keys = ['answer','result','response','text','content','data'];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object') {
      const s = extractAnswerFromJson(v);
      if (s) return s;
    }
  }
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const s = extractAnswerFromJson(it);
      if (s) return s;
    }
  }
  return '';
}

/** ====== MAIN COMMAND ====== */
async function claudeCommand(sock, chatId, message, rawArgs) {
  const endpoint = 'https://zelapioffciall.koyeb.app/ai/claude';

  try {
    await showTyping(sock, chatId);
    await react(sock, chatId, message.key, '🤖'); // <<< reaction saat “mikir”

    const text = getArgsFrom(message, rawArgs);
    if (!text) {
      const help = [
        HEAD(`${ICON.bot} Claude AI`),
        'Advanced conversational AI assistant.',
        '',
        '*Cara pakai:*',
        '• *.claude <pertanyaan/perintah>*',
        '  _cth:_ *.claude jelaskan promise vs async-await di JS*',
        '• Atau balas teks dengan: *.claude*',
        '',
        `${ICON.tip} Jawaban akan ditampilkan langsung, rapi & siap copy.`,
      ].join('\n');
      await sock.sendMessage(chatId, { text: help, ...channelInfo }, { quoted: message });
      await react(sock, chatId, message.key, ''); // hapus reaction
      return;
    }

    let res = await fetch(endpoint, {
      method: 'POST',
      timeout: 60_000,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const url = `${endpoint}?text=${encodeURIComponent(text)}`;
      res = await fetch(url, { method: 'GET', timeout: 60_000 });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let bodyText = '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      bodyText = extractAnswerFromJson(data) || JSON.stringify(data, null, 2);
    } else {
      bodyText = await res.text();
    }

    bodyText = normalizeText(bodyText);

    const header = HEAD(`${ICON.bot} Claude AI`);
    const finalText = `${header}\n${bodyText}`;
    for (const p of chunkText(finalText)) {
      await sock.sendMessage(chatId, { text: p, ...channelInfo }, { quoted: message });
    }

    await react(sock, chatId, message.key, '✅'); // sukses
    setTimeout(() => react(sock, chatId, message.key, ''), 2000); // bersihkan reaction

  } catch (err) {
    console.error('claudeCommand error:', err);
    const card = [
      HEAD(`${ICON.err} Gagal menghubungi Claude AI`),
      'Terjadi gangguan. Coba lagi sebentar ya.'
    ].join('\n');
    await sock.sendMessage(chatId, { text: card, ...channelInfo }, { quoted: message });
    await react(sock, chatId, message.key, '❌'); // gagal
    setTimeout(() => react(sock, chatId, message.key, ''), 2500);
  } finally {
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
  }
}

module.exports = { claudeCommand };
