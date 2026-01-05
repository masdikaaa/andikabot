// commands/mention.js — Andika Bot (Baileys v7 SAFE) — Mention → LLM bebas (NekoLabs GPT-5)
// - Kalau bot di-mention → kirim isi chat ke LLM apa adanya (plus sedikit aturan basic)
// - Jawaban default: natural, jelas, gak bertele-tele
// - Kalau user minta format/gaya tertentu → biarkan LLM ikuti permintaan user
// - .mention on/off/status/reset/global

'use strict';

const fs   = require('fs');
const path = require('path');
const {
  jidNormalizedUser,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const { channelInfo }   = require('../lib/messageConfig');
const isAdmin           = require('../lib/isAdmin');
const { isSudo }        = require('../lib/index');
const { UploadFileUgu } = require('../lib/uploader');

/* =======================
   BRAND & KONSTANTA
======================= */
const BRAND = 'Andika Bot';
const ICON  = { bot:'🤖', ok:'✅', warn:'⚠️', err:'❌', dot:'•' };

// LLM: NekoLabs GPT-5 (GET)
const LLM_BASE          = 'https://api.nekolabs.web.id/text-generation/gpt/5';
const SYSTEM_PROMPT     = 'bot'; // sesuai Swagger

const TIMEOUT_MS        = 60000;  // teks biasa (60s)
const IMG_TIMEOUT_MS    = 90000;  // gambar (kalau nanti mau dipakai lagi)
const RETRY_BACKOFFMS   = 700;

// batas byte per pesan WA (biar nggak kepotong)
const MENTION_COOLDOWN_MS = 3500; // per chat
const USER_COOLDOWN_MS    = 6000; // per user
const CHUNK_MAX           = 5000; // ~5KB per bubble
const SAFE_TEXT_BYTES     = 4000;
const QS_LIMIT            = 1800;

const DEBUG = process.env.ANDIKA_DEBUG === '1';

/* =======================
   DEBUG
======================= */
const T0  = Date.now();
const ts  = () => ((Date.now() - T0) / 1000).toFixed(3).padStart(7,' ');
const dbg = (...a)=>{ if (DEBUG) console.log(`[DBG ${ts()}]`, ...a); };
const inf = (...a)=> console.log(`[INF ${ts()}]`, ...a);
const wrn = (...a)=> console.warn(`[WRN ${ts()}]`, ...a);
const err = (...a)=> console.error(`[ERR ${ts()}]`, ...a);

/* =======================
   HTTP/FETCH
======================= */
function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  try { return require('undici').fetch; } catch { throw new Error('Fetch not available'); }
}
const FETCH = getFetch();

async function fetchWithTimeout(url, init = {}, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t   = setTimeout(() => ctl.abort(), ms);

  try {
    return await FETCH(url, {
      ...init,
      signal: ctl.signal,
      headers: { accept:'application/json', ...(init.headers || {}) }
    });
  } finally {
    clearTimeout(t);
  }
}

function qp(obj){
  const p = new URLSearchParams();
  for (const [k,v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

async function parseJSON(res){
  const body = await res.text().catch(() => '');
  const snippet = body.slice(0, 200);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${snippet}`);
  }

  try {
    const j = JSON.parse(body);
    return String(j.result || j.answer || j.message || j.text || body).trim();
  } catch {
    // kalau 200 tapi HTML, berarti error page
    if (/<!DOCTYPE html>|<html/i.test(snippet)) {
      throw new Error('Upstream returned HTML (kemungkinan error page).');
    }
    return body.trim();
  }
}

/* =======================
   UTIL TEKS & FORMAT WA
======================= */
function utf8len(s=''){ return Buffer.byteLength(String(s), 'utf8'); }

function smartCut(s='', maxBytes=SAFE_TEXT_BYTES){
  let t = String(s || '');
  if (utf8len(t) <= maxBytes) return t;

  let cut = t.slice(0, Math.max(0, maxBytes - 200));
  const idx = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('\n'),
    cut.lastIndexOf(' ')
  );
  if (idx > 300) cut = cut.slice(0, idx + 1);

  while (utf8len(cut) > maxBytes) {
    cut = cut.slice(0, cut.length - 50);
  }
  return cut.trim() + ' …';
}

function tidyBullets(s=''){
  let t = String(s)
    .replace(/^\s*[-*]\s+/gm, `${ICON.dot} `)
    .replace(/^\s*\d+\.\s+/gm, `${ICON.dot} `)
    .replace(/•\s*•\s*/g, `${ICON.dot} `)
    .replace(/\r/g,'')
    .replace(/\t/g,'  ')
    .replace(/\n{3,}/g, '\n\n');

  const lines = t.split('\n');
  const out   = [];
  let inCode  = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      out.push(line);
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }

    while (line.length > 110) {
      const cut = line.lastIndexOf(' ', 100);
      const idx = cut > 70 ? cut : 100;
      out.push(line.slice(0, idx));
      line = line.slice(idx).trimStart();
    }
    out.push(line);
  }

  return out.join('\n').trim();
}

function header(title='Jawaban AI'){
  return `╭─〔 ${title} 〕\n│ ${BRAND}\n╰──────────────────`;
}

function stamp(){
  return new Date().toLocaleString('id-ID', { hour12:false });
}

function wrapStyled(title, body){
  return `${header(title)}\n${body}\n\n${ICON.ok} ${stamp()}`;
}

function stripOpeners(s=''){
  return String(s)
    .replace(/^(\s*(halo|hai|hello|hiya|hi|ass?alam)[^\n]*\n)/i, '')
    .replace(/(^|\n)\s*(saya|aku)\s+ad(a|alah)\s+.*?(asisten|ai|bot)[^\n]*\n/i, '$1')
    .trim();
}

/** Split text menjadi beberapa part berdasarkan BYTE, bukan panjang karakter */
function splitByBytes(text, maxBytes) {
  const lines  = String(text || '').split('\n');
  const chunks = [];
  let current  = '';

  const pushCurrent = () => {
    if (!current) return;
    chunks.push(current);
    current = '';
  };

  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (utf8len(candidate) <= maxBytes) {
      current = candidate;
      continue;
    }

    // candidate kepanjangan → simpan current dulu
    pushCurrent();

    // kalau satu baris masih kepanjangan, hard split per byte
    if (utf8len(line) > maxBytes) {
      let rest = line;
      while (utf8len(rest) > maxBytes) {
        let sliceLen = Math.min(rest.length, maxBytes);
        while (sliceLen > 0 && utf8len(rest.slice(0, sliceLen)) > maxBytes) {
          sliceLen -= 50;
        }
        if (!sliceLen) break;
        chunks.push(rest.slice(0, sliceLen));
        rest = rest.slice(sliceLen);
      }
      current = rest;
    } else {
      current = line;
    }
  }
  pushCurrent();
  return chunks;
}

async function chunkSend(sock, chatId, quoted, text){
  const full = String(text || '');
  if (!full) return;

  if (utf8len(full) <= CHUNK_MAX) {
    return sock.sendMessage(
      chatId,
      { text: full, ...(channelInfo || {}) },
      { quoted }
    );
  }

  const parts = splitByBytes(full, CHUNK_MAX);
  const total = parts.length;

  for (let i = 0; i < total; i++) {
    const suffix = total > 1 ? `\n\n(${i+1}/${total})` : '';
    await sock.sendMessage(
      chatId,
      { text: parts[i] + suffix, ...(channelInfo || {}) },
      { quoted: i === 0 ? quoted : undefined }
    );
  }
}

/* =======================
   PROMPT BUILDER (SIMPLE)
======================= */

function isCodeRequest(text = '') {
  const t = text.toLowerCase();
  return /kode|script|skrip|contoh.*(kode|script|config|konfigurasi)|caddyfile|dockerfile|docker compose|docker-compose|yaml|yml|nginx|haproxy|reverse proxy|config server/.test(t);
}

/**
 * Bangun prompt buat LLM, tapi tidak memaksa struktur aneh.
 * Intinya:
 *  - Ikuti bahasa & format dari user
 *  - Kalau user cuma salam → balas salam ramah
 *  - Jawaban jangan bertele-tele, tapi tetap lengkap kalau user minta detail
 *  - Kalau user minta KODE → blok kode lengkap dulu, baru penjelasan singkat
 */
function buildGeminiPrompt(userText, imageUrl) {
  const wantsCode = isCodeRequest(userText || '');

  const baseRules = [
    'Kamu adalah asisten WhatsApp bernama "Andika Bot".',
    'Jawablah langsung pertanyaan pengguna dengan jelas dan mudah dipahami.',
    'Ikuti bahasa yang dipakai pengguna (Indonesia/Inggris/dll).',
    'Jika pengguna menulis aturan atau format khusus (misalnya poin, struktur tertentu, bahasa tertentu), WAJIB diikuti.',
    'Jika pengguna tidak meminta jawaban panjang, berikan jawaban yang ringkas dan fokus ke hal penting saja.',
    'Jika pengguna minta penjelasan detail, berikan jawaban lengkap dan TUNTAS, jangan berhenti di tengah kalimat atau hanya di poin pertama.',
    'Jika menjawab dalam bentuk poin bernomor, usahakan semua langkah penting dituliskan (bukan cuma 1 poin).',
    'Jika pesan hanya berisi salam atau sapaan singkat (seperti "pagi", "malam", "halo bot", "permisi"), cukup balas salam secara ramah dan tanyakan ada yang bisa dibantu — jangan menganalisis sebagai error atau membuat laporan teknis.',
    'Jangan memulai dengan kalimat formal yang tidak diminta seperti "berikut adalah penjelasannya" atau "sebagai AI".',
    'Jangan menjelaskan cara kerja dirimu, cukup berikan jawaban.'
  ];

  if (wantsCode) {
    baseRules.push(
      'Pengguna sedang MEMINTA CONTOH KODE / KONFIGURASI.',
      'Prioritaskan memberikan SATU blok kode lengkap dalam format markdown ```...``` yang siap dipakai (misalnya Caddyfile, Dockerfile, YAML, dsb).',
      'Tuliskan kode sampai selesai (jangan dipotong di tengah).',
      'Setelah blok kode, boleh berikan penjelasan singkat dalam beberapa kalimat atau poin.',
      'Jangan hanya memberikan penjelasan teori tanpa menyertakan blok kode.'
    );
  }

  const rules = baseRules.join(' ');

  const imgPart = imageUrl
    ? `\n\nJika ada informasi di gambar berikut yang relevan, gunakan sebagai konteks (tidak perlu menampilkan URL-nya di jawaban): ${imageUrl}`
    : '';

  return `${rules}\n\nPesan pengguna:\n${userText || '(kosong)'}${imgPart}`;
}

function postProcessAnswer(ans) {
  // Cuma sedikit dirapikan, tanpa memaksa struktur baru
  return tidyBullets(stripOpeners(ans || ''));
}

/* =======================
   BAILEYS HELPERS
======================= */
function unwrapMessage(msg){
  let m = msg || {};
  for (let i = 0; i < 6; i++) {
    if (m?.ephemeralMessage?.message)           { m = m.ephemeralMessage.message; continue; }
    if (m?.viewOnceMessage?.message)           { m = m.viewOnceMessage.message; continue; }
    if (m?.viewOnceMessageV2?.message)         { m = m.viewOnceMessageV2.message; continue; }
    if (m?.viewOnceMessageV2Extension?.message){ m = m.viewOnceMessageV2Extension.message; continue; }
    if (m?.documentWithCaptionMessage?.message){ m = m.documentWithCaptionMessage.message; continue; }
    if (m?.editedMessage?.message)             { m = m.editedMessage.message; continue; }
    break;
  }
  return m;
}

function baseNum(jid){
  if (!jid) return '';
  const left = String(jid).split('@')[0];
  return left.split(':')[0].replace(/\D/g,'');
}

function getTextFromMessage(WAMessage){
  const m = unwrapMessage(WAMessage?.message || {});
  return (
    m.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    ''
  ).trim();
}

function gatherContextInfos(m){
  return [
    m?.extendedTextMessage?.contextInfo,
    m?.imageMessage?.contextInfo,
    m?.videoMessage?.contextInfo,
    m?.documentMessage?.contextInfo,
    m?.stickerMessage?.contextInfo,
    m?.buttonsResponseMessage?.contextInfo,
    m?.listResponseMessage?.contextInfo
  ].filter(Boolean);
}

function getMentionedJids(WAMessage){
  const m    = unwrapMessage(WAMessage?.message || {});
  const ctxs = gatherContextInfos(m);
  const out  = [];
  for (const c of ctxs) {
    if (Array.isArray(c.mentionedJid)) out.push(...c.mentionedJid);
  }
  return out;
}

function getQuotedData(WAMessage){
  const m        = unwrapMessage(WAMessage?.message || {});
  const contexts = gatherContextInfos(m);

  for (const ctx of contexts) {
    if (ctx?.quotedMessage) {
      const text =
        ctx.quotedMessage.conversation ||
        ctx.quotedMessage?.extendedTextMessage?.text ||
        ctx.quotedMessage?.imageMessage?.caption ||
        ctx.quotedMessage?.videoMessage?.caption ||
        '';
      const stanzaId   = ctx.stanzaId || ctx.stanzaID || ctx.id;
      const participant= ctx.participant || ctx.participants?.[0];
      const remoteJid  = WAMessage.key?.remoteJid;

      return {
        text: (text || '').trim(),
        quotedForReply: {
          key: { remoteJid, id: stanzaId, participant },
          message: ctx.quotedMessage
        }
      };
    }
  }
  return { text:'', quotedForReply:null };
}

/* =======================
   BACA/UPLOAD GAMBAR → Uguu
======================= */
function extFromMime(m){
  if (!m) return '.jpg';
  const t = m.split('/')[1] || 'jpg';
  if (t.includes('jpeg')) return '.jpg';
  return '.' + t.toLowerCase();
}

async function readImageFromMessage(message){
  const msg = unwrapMessage(message?.message || {});
  if (msg?.imageMessage) {
    const mimetype = msg.imageMessage.mimetype || 'image/jpeg';
    const stream   = await downloadContentFromMessage(msg.imageMessage,'image');
    const bufs     = [];
    for await (const c of stream) bufs.push(c);
    return { buffer: Buffer.concat(bufs), mimetype };
  }

  const contexts = gatherContextInfos(msg);
  for (const ctx of contexts) {
    if (ctx?.quotedMessage?.imageMessage) {
      const mimetype = ctx.quotedMessage.imageMessage.mimetype || 'image/jpeg';
      const stream   = await downloadContentFromMessage(ctx.quotedMessage.imageMessage,'image');
      const bufs     = [];
      for await (const c of stream) bufs.push(c);
      return { buffer: Buffer.concat(bufs), mimetype };
    }
  }
  return null;
}

async function uploadWithUguu(buffer, mimetype){
  const tempDir = path.join(__dirname,'..','temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive:true });

  const tmp = path.join(tempDir, `wa_${Date.now()}${extFromMime(mimetype)}`);
  fs.writeFileSync(tmp, buffer);

  try {
    const res = await UploadFileUgu(tmp);
    const url = typeof res === 'string' ? res : (res.url || res.url_full || '');
    if (!url) throw new Error('Uguu no url');
    return url;
  } finally {
    setTimeout(() => {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
    }, 1500);
  }
}

/* =======================
   LLM (GPT-5) + retry
   👉 SEKARANG kirim imageUrl juga
======================= */
async function askGemini({ text, imageUrl, systemPrompt = SYSTEM_PROMPT, sessionId, timeoutMs }) {
  const raw = String(text || '').trim();

  const shaped = {
    text        : raw,
    systemPrompt: systemPrompt || undefined,
    imageUrl    : imageUrl || undefined,
    sessionId   : sessionId || undefined
  };

  let q = qp(shaped);

  // kalau querystring kepanjangan → buang imageUrl dulu
  if (q.length > QS_LIMIT) {
    delete shaped.imageUrl;
    q = qp(shaped);
  }

  // kalau MASIH kepanjangan → potong teks
  if (q.length > QS_LIMIT) {
    shaped.text = smartCut(raw, SAFE_TEXT_BYTES);
    q = qp(shaped);
  }

  const url      = `${LLM_BASE}?${q}`;
  const hasImage = !!shaped.imageUrl;
  const t1       = timeoutMs || (hasImage ? IMG_TIMEOUT_MS : TIMEOUT_MS);
  const t2       = Math.floor(t1 * 1.3);

  try {
    const res1 = await fetchWithTimeout(url, { method:'GET' }, t1);
    return await parseJSON(res1);
  } catch (e1) {
    const msg     = String(e1?.message || e1).toLowerCase();
    const aborted = msg.includes('abort') || msg.includes('timed out') || msg.includes('timeout');
    if (!aborted) throw e1;
    wrn('[HTTP] timeout → retry longer');
    await new Promise(r => setTimeout(r, RETRY_BACKOFFMS));
  }

  const res2 = await fetchWithTimeout(url, { method:'GET' }, t2);
  return parseJSON(res2);
}

/* =======================
   ANTI-SPAM & LOCKS
======================= */
const _lastAt          = new Map(); // chatId -> ts
const _processedMsgIds = new Set(); // stanza id de-dupe
const _chatLocks       = new Map(); // chatId -> boolean
const _userLastAt      = new Map(); // userJid -> ts

function coolingChat(chatId){
  const last = _lastAt.get(chatId) || 0;
  const now  = Date.now();
  if (now - last < MENTION_COOLDOWN_MS) return true;
  _lastAt.set(chatId, now);
  return false;
}

function tryLock(chatId){
  if (_chatLocks.get(chatId)) return false;
  _chatLocks.set(chatId, true);
  return true;
}

function unlock(chatId){
  _chatLocks.delete(chatId);
}

function userCooling(senderJid){
  const last = _userLastAt.get(senderJid) || 0;
  const now  = Date.now();
  if (now - last < USER_COOLDOWN_MS) return true;
  _userLastAt.set(senderJid, now);
  return false;
}

/* =======================
   STORE HELPERS
======================= */
const STORE = path.join(__dirname, '..', 'data', 'mentionSettings.json');

function loadStore(){
  try {
    return JSON.parse(fs.readFileSync(STORE,'utf8'));
  } catch {
    return { globalEnabled:true, groups:{} }; // default ON
  }
}

function saveStore(j){
  fs.mkdirSync(path.dirname(STORE), { recursive:true });
  fs.writeFileSync(STORE, JSON.stringify(j, null, 2));
}

function getMentionEnabled(chatId){
  const j = loadStore();
  if (j.groups && chatId in (j.groups || {})) {
    const v = j.groups[chatId]?.enabled;
    if (typeof v === 'boolean') return v;
  }
  return !!j.globalEnabled;
}

/* =======================
   MENTION HANDLER
======================= */
function isAskingName(s=''){
  const t = s.toLowerCase();
  return /(siapa|apa)\s+nama( ?mu| (kamu|bot))|nama\s+(kamu|bot)\s*siapa|kenalan|siapa\s+kamu/.test(t);
}

async function handleMentionDetection(sock, chatId, message) {
  const finish = () => unlock(chatId);

  try {
    const raw = getTextFromMessage(message);
    if (/^\s*\./.test(raw)) return; // biar handler lain jalan

    // de-dupe stanza id
    const stanzaId = message?.key?.id || '';
    if (stanzaId) {
      if (_processedMsgIds.has(stanzaId)) return;
      _processedMsgIds.add(stanzaId);
      setTimeout(() => _processedMsgIds.delete(stanzaId), 5 * 60 * 1000);
    }

    // mutex per chat
    if (!tryLock(chatId)) { dbg('[FLOW]', chatId, 'busy → skip'); return; }

    if (coolingChat(chatId)) { dbg('[FLOW]', chatId, 'cooldown'); finish(); return; }

    // cek mention bot (id/lid-safe)
    const mentioned = getMentionedJids(message);
    if (!mentioned || mentioned.length === 0) { finish(); return; }

    const myJid    = jidNormalizedUser(sock.user?.id || '');
    const myNum    = baseNum(myJid);
    const myLid    = sock.user?.lid || '';
    const myLidNum = baseNum(myLid);

    const isBotMentioned = mentioned.some(jid => {
      const num = baseNum(jid);
      return num && (num === myNum || (myLidNum && num === myLidNum));
    });
    if (!isBotMentioned) { finish(); return; }

    // rate-limit per user
    const senderJid = message?.key?.participant || message?.key?.remoteJid || '';
    if (userCooling(senderJid)) { dbg('[RATE]', senderJid, 'cooling'); finish(); return; }

    // cek setting per chat
    const enabled = getMentionEnabled(chatId);
    if (!enabled) { finish(); return; }

    const textNoMentions             = raw.replace(/@\S+/g,'').trim();
    const { text:quotedText, quotedForReply } = getQuotedData(message);
    const qText                      = textNoMentions || quotedText || '';

    // quick: tanya nama
    if (qText && isAskingName(qText)) {
      await sock.sendMessage(
        chatId,
        { text: 'Aku **Andika Bot Asisten** 🤝', ...(channelInfo || {}) },
        { quoted: message }
      );
      finish();
      return;
    }

    // gambar (opsional)
    let imageUrl = null;
    try {
      const img = await readImageFromMessage(message);
      if (img?.buffer?.length) imageUrl = await uploadWithUguu(img.buffer, img.mimetype);
    } catch(e) {
      wrn('[IMG] upload gagal:', e?.message || e);
    }

    // kalau sama sekali ga ada teks & gambar → minta perjelas
    if (!imageUrl && !qText) {
      const hint =
        'Pesan yang kamu kirim belum ada pertanyaan atau konteksnya kurang jelas.\n' +
        'Silakan kirim pertanyaan atau jelaskan dulu yang ingin dibahas. 🙂';
      await sock.sendMessage(
        chatId,
        { text: wrapStyled('Perjelas Dulu', hint), ...(channelInfo || {}) },
        { quoted: message }
      );
      finish();
      return;
    }

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}
    try {
      await sock.sendMessage(
        chatId,
        { react: { text: imageUrl ? '🖼️' : ICON.bot, key: message.key } }
      );
    } catch {}

    const sessionId  = `wa-${baseNum(chatId) || 'chat'}-${baseNum(message.key.participant || message.key.remoteJid) || 'user'}`;
    const promptText = buildGeminiPrompt(qText, imageUrl);

    // jawaban utama dari LLM (biarkan dia yang "pintar")
    let rawAns;
    try {
      rawAns = await askGemini({
        text        : promptText,
        imageUrl,              // 👉 kirim URL gambar ke API
        systemPrompt: SYSTEM_PROMPT,
        sessionId
      });
    } catch (eLLM) {
      err('[LLM] error:', eLLM);
      const msgErr =
        'Maaf, layanan AI lagi *error / penuh* (kemungkinan HTTP 5xx dari API).\n' +
        'Silakan coba lagi beberapa saat lagi ya. 🙏';
      await chunkSend(
        sock,
        chatId,
        message,
        wrapStyled('Server AI Gangguan', msgErr)
      );
      finish();
      return;
    }

    let finalBody = postProcessAnswer(rawAns);

    const final = wrapStyled('Jawaban AI', finalBody);
    await chunkSend(
      sock,
      chatId,
      (quotedText ? quotedForReply : message),
      final
    );

    try {
      await sock.sendMessage(
        chatId,
        { react: { text: '✅', key: message.key } }
      );
    } catch {}
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}

    inf('[FLOW] replied', { chat: chatId, len: utf8len(final) });
    finish();
  } catch (e) {
    err('handleMentionDetection error:', e);
    try {
      const msgErr =
        'Maaf, ada error internal di modul *mention*.\n' +
        'Silakan kirim lagi pesanmu sebentar lagi. 🙏';
      await chunkSend(
        sock,
        chatId,
        message,
        wrapStyled('Error Internal', msgErr)
      );
    } catch {}
    unlock(chatId);
  }
}

/* =======================
   .mention on/off/status/reset
======================= */
async function mentionCommand(sock, chatId, senderId, message, argsStr='') {
  try {
    const args = (argsStr || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sub  = args[0];

    const isGroup  = chatId.endsWith('@g.us');
    const adminInf = isGroup ? await isAdmin(sock, chatId, senderId) : { isSenderAdmin:true, isBotAdmin:true };
    const sudo     = await safeIsSudo(senderId);
    const isOwner  = !!message.key.fromMe;

    if (isGroup) {
      if (!adminInf.isBotAdmin) {
        await sock.sendMessage(
          chatId,
          { text: '🛡️ Jadikan *bot admin* dulu ya.', ...(channelInfo || {}) },
          { quoted: message }
        );
        return;
      }
      if (!adminInf.isSenderAdmin && !sudo && !isOwner) {
        await sock.sendMessage(
          chatId,
          { text: '🚫 Hanya admin grup, owner, atau sudo.', ...(channelInfo || {}) },
          { quoted: message }
        );
        return;
      }
    }

    const j = loadStore();
    j.groups = j.groups || {};

    if (!sub || !['on','off','status','reset','global'].includes(sub)) {
      const body =
        '╭─〔 🤖 PENGATURAN MENTION 〕\n' +
        '│ *.mention on/off*    → aktif/nonaktif di chat ini\n' +
        '│ *.mention status*    → lihat status chat ini\n' +
        '│ *.mention reset*     → hapus setelan chat (ikut global)\n' +
        '│ *.mention global on/off/status* (owner/sudo)\n' +
        '╰──────────────────────';
      await sock.sendMessage(
        chatId,
        { text: body, ...(channelInfo || {}) },
        { quoted: message }
      );
      return;
    }

    if (sub === 'status') {
      const current = j.groups[chatId]?.enabled ?? j.globalEnabled ?? true;
      const text =
        `📊 Status Mention` +
        `\n• Chat : ${current ? '🟢 ON' : '🔴 OFF'}` +
        `\n• Global : ${j.globalEnabled ? '🟢 ON' : '🔴 OFF'}`;
      await sock.sendMessage(
        chatId,
        { text, ...(channelInfo || {}) },
        { quoted: message }
      );
      return;
    }

    if (sub === 'reset') {
      delete j.groups[chatId];
      saveStore(j);
      await sock.sendMessage(
        chatId,
        {
          text: `♻️ Setelan chat dihapus → ikut Global: ${j.globalEnabled ? '🟢 ON' : '🔴 OFF'}`,
          ...(channelInfo || {})
        },
        { quoted: message }
      );
      return;
    }

    if (sub === 'global') {
      if (!sudo && !isOwner) {
        await sock.sendMessage(
          chatId,
          { text: '🔒 Hanya owner/sudo.', ...(channelInfo || {}) },
          { quoted: message }
        );
        return;
      }
      const v = args[1];
      if (!['on','off','status'].includes(v || '')) {
        await sock.sendMessage(
          chatId,
          { text: 'Format: *.mention global on/off/status*', ...(channelInfo || {}) },
          { quoted: message }
        );
        return;
      }
      if (v === 'status') {
        await sock.sendMessage(
          chatId,
          { text: `🌐 Global: ${j.globalEnabled ? '🟢 ON' : '🔴 OFF'}`, ...(channelInfo || {}) },
          { quoted: message }
        );
        return;
      }
      j.globalEnabled = (v === 'on');
      saveStore(j);
      await sock.sendMessage(
        chatId,
        { text: `🌐 Global Mention: ${j.globalEnabled ? '🟢 ON' : '🔴 OFF'}`, ...(channelInfo || {}) },
        { quoted: message }
      );
      return;
    }

    // sub on/off (per chat)
    if (sub === 'on' || sub === 'off') {
      j.groups[chatId] = j.groups[chatId] || {};
      j.groups[chatId].enabled = (sub === 'on');
      saveStore(j);
      await sock.sendMessage(
        chatId,
        { text: `✅ Mention chat ini: ${j.groups[chatId].enabled ? '🟢 ON' : '🔴 OFF'}`, ...(channelInfo || {}) },
        { quoted: message }
      );
      return;
    }
  } catch (e) {
    err('mentionCommand error:', e);
    await sock.sendMessage(
      chatId,
      { text: '❌ Terjadi kesalahan saat memproses perintah *mention*.', ...(channelInfo || {}) },
      { quoted: message }
    );
  }
}

async function safeIsSudo(jid){
  try { return await isSudo(jid); }
  catch { return false; }
}

/* =======================
   EXPORTS
======================= */
module.exports = {
  handleMentionDetection,
  mentionCommand
};
