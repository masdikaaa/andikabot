// commands/quote.js — Andika Bot style (Baileys v7 SAFE)
// Quote Indonesia berbasis Gemini 2.5 Flash (NekoLabs, GET-only)
// Pemakaian:
//   .quote <tema/arah quote>
//   (atau reply pesan lalu ketik .quote)
//
// Endpoint: https://api.nekolabs.web.id/ai/gemini/2.5-flash/v2
// Params : text=..., systemPrompt=bot

'use strict';

const path = require('path');

// prefer undici kalau ada (lebih stabil); fallback ke node-fetch
function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  try { return require('undici').fetch; } catch { return require('node-fetch'); }
}
const fetch = getFetch();

/* =======================
   BRAND & UI
======================= */
const BRAND = 'Andika Bot';
const ICON  = { spark:'✨', ok:'✅', err:'❌', dart:'🎯', msg:'💬', time:'🕒', dot:'•' };

let channelInfo = {};
try {
  const cfg = require('../lib/messageConfig');
  if (cfg && cfg.channelInfo) channelInfo = cfg.channelInfo; // badge forwarded newsletter
} catch { channelInfo = {}; }

function nowID() {
  try { return new Date().toLocaleString('id-ID', { hour12: false }); }
  catch { return new Date().toISOString().replace('T',' ').slice(0,16); }
}

const HEAD = (title='QUOTE') =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

function box(title, body){
  return `${HEAD(title)}\n${body}\n\n${ICON.ok} ${nowID()}`;
}

function bullets(lines=[]) {
  return lines.map(x => `${ICON.dot} ${x}`).join('\n');
}

/* =======================
   Baileys helpers
======================= */
function unwrapMessage(m){ let x=m||{}; for(let i=0;i<6;i++){ 
  if(x?.ephemeralMessage?.message){x=x.ephemeralMessage.message;continue;}
  if(x?.viewOnceMessage?.message){x=x.viewOnceMessage.message;continue;}
  if(x?.viewOnceMessageV2?.message){x=x.viewOnceMessageV2.message;continue;}
  if(x?.viewOnceMessageV2Extension?.message){x=x.viewOnceMessageV2Extension.message;continue;}
  if(x?.documentWithCaptionMessage?.message){x=x.documentWithCaptionMessage.message;continue;}
  if(x?.editedMessage?.message){x=x.editedMessage.message;continue;}
  break; } return x;
}

function getQuotedText(WAMessage) {
  const msg = unwrapMessage(WAMessage?.message || {});
  const ctxs = [
    msg?.extendedTextMessage?.contextInfo,
    msg?.imageMessage?.contextInfo,
    msg?.videoMessage?.contextInfo,
    msg?.documentMessage?.contextInfo,
    msg?.stickerMessage?.contextInfo,
    msg?.buttonsResponseMessage?.contextInfo,
    msg?.listResponseMessage?.contextInfo
  ].filter(Boolean);

  for (const c of ctxs) {
    const q = c?.quotedMessage;
    if (!q) continue;
    const t = q.conversation
      || q?.extendedTextMessage?.text
      || q?.imageMessage?.caption
      || q?.videoMessage?.caption
      || '';
    if (t && String(t).trim()) return String(t).trim();
  }
  return '';
}

function getTextFromMessage(WAMessage) {
  const m = unwrapMessage(WAMessage?.message || {});
  return (m.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || '').trim();
}

/* =======================
   Chunk sender
======================= */
async function sendChunked(sock, chatId, text, quoted) {
  const max = 3500;
  if (text.length <= max) {
    await sock.sendMessage(chatId, { text, ...(channelInfo||{}) }, { quoted });
    return;
  }
  for (let i=0; i<text.length; i+=max) {
    await sock.sendMessage(chatId, { text: text.slice(i, i+max), ...(channelInfo||{}) }, { quoted });
  }
}

function preview(str, n = 160) {
  const s = String(str||'').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/* =======================
   Prompt Builder
======================= */
const ID_STYLE_INSTRUCTION =
  'TULIS DALAM *BAHASA INDONESIA* yang alami dan ringkas. ' +
  'Buat *1 kutipan pendek* (maksimal 2 kalimat). ' +
  'Jika ada penulis/atribusi yang jelas, cantumkan di baris baru dengan format: — Nama Penulis. ' +
  'Tanpa bahasa Inggris. Tanpa emoji berlebihan.';

function buildPrompt(userHint) {
  const theme = (userHint || '').trim() || 'motivasi singkat';
  return [
    ID_STYLE_INSTRUCTION,
    '',
    `Tema/arah: ${theme}`,
    '',
    'Contoh format keluaran:',
    '“Jangan menunggu sempurna untuk memulai.”',
    '— (kosongkan jika tidak ada penulis yang pasti)',
    '',
    'Keluarkan hanya *isi kutipan*, tanpa kalimat penjelas lain.'
  ].join('\n');
}

/* =======================
   NekoLabs Gemini Flash v2 (GET)
======================= */
const GEMINI_URL = 'https://api.nekolabs.web.id/ai/gemini/2.5-flash/v2';
const SYSTEM_PROMPT = 'bot'; // sesuai spes NekoLabs

async function askGemini(text){
  const qs = new URLSearchParams({ text, systemPrompt: SYSTEM_PROMPT }).toString();
  const url = `${GEMINI_URL}?${qs}`;

  const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }});
  const raw = await res.text().catch(()=> '');
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${raw.slice(0,180)}`);

  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }

  let answer = '';
  if (typeof data === 'string') answer = data;
  else answer = data.result || data.answer || data.message || data.text || '';

  if (!answer) throw new Error('Response kosong/tidak valid');
  return String(answer).trim();
}

/* =======================
   Command
======================= */
module.exports = async function quoteCommand(sock, chatId, message) {
  try {
    const raw = getTextFromMessage(message);
    const parts = raw.trim().split(/\s+/);
    const isQuoteCmd = (parts[0] || '').toLowerCase() === '.quote';
    if (!isQuoteCmd) return;

    const argText     = raw.trim().slice(6).trim(); // hapus ".quote"
    const repliedText = getQuotedText(message);
    const userHint    = argText || repliedText || '';

    if (!userHint) {
      const helpBody = [
        `${ICON.spark} Kirim *1* kutipan Indonesia *pendek* berdasar tema yang kamu minta.`,
        '',
        bullets([
          '`.quote motivasi`',
          '`.quote cinta dewasa`',
          '`.quote kerja keras`',
          'atau reply pesan lalu ketik `.quote`'
        ])
      ].join('\n');
      const usage = box('QUOTE — CARA PAKAI', helpBody);
      await sock.sendMessage(chatId, { text: usage, ...(channelInfo||{}) }, { quoted: message });
      return;
    }

    await sock.sendMessage(chatId, { react: { text: '📝', key: message.key } });

    const head  = `${HEAD('QUOTE')}\n${ICON.dart} *Tema:* ${preview(userHint)}`;
    const prompt= buildPrompt(userHint);

    // call NekoLabs
    const answer = await askGemini(prompt);

    const out = [
      head,
      '',
      `${ICON.msg} ${answer}`,
      '',
      bullets([
        '`.quote motivasi`',
        '`.quote cinta dewasa`',
        '`.quote kerja keras`',
        '(atau reply pesan lalu ketik `.quote`)'
      ])
    ].join('\n');

    await sendChunked(sock, chatId, out, message);
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
  } catch (e) {
    const msg =
      box(`${ICON.err} GAGAL AMBIL QUOTE`,
        `${ICON.dot} Coba lagi ya.\n${ICON.dot} Detail: ${String(e?.message || e).slice(0, 180)}…`);
    await sock.sendMessage(chatId, { text: msg, ...(channelInfo||{}) }, { quoted: message });
  }
};
