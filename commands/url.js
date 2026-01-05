// commands/url.js — Andika Bot style (Baileys v7 safe)
// ✔️ Output WA rapi (header brand, emoji), Indonesia only
// ✔️ Ambil media dari pesan sekarang / quoted
// ✔️ Upload TelegraPh (image/webp) → fallback Uguu (all types)
// ✔️ Info jenis, ukuran, host, dan URL; auto hapus temp
'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { UploadFileUgu, TelegraPh } = require('../lib/uploader');
const { channelInfo } = require('../lib/messageConfig'); // badge/forward khas Andika Bot

/* =======================
   Branding & Format WA
======================= */
const BRAND = 'Andika Bot';
const ICON  = { ok:'✅', warn:'⚠️', err:'❌', link:'🔗', file:'🗂️', img:'🖼️', vid:'🎬', aud:'🎧', doc:'📄', stk:'💠' };
const CHUNK_MAX = 3500; // batas aman kirim teks WA

function header(title='URL Media'){ return `╭─〔 ${title} 〕\n│ ${BRAND}\n╰──────────────────`; }
function stamp(){ return new Date().toLocaleString('id-ID', { hour12: false }); }
function wrap(title, body){ return `${header(title)}\n${body}\n\n${ICON.ok} ${stamp()}`; }
async function chunkSend(sock, chatId, quoted, text){
  if (text.length <= CHUNK_MAX) return sock.sendMessage(chatId, { text, ...(channelInfo||{}) }, { quoted });
  for (let i=0;i<text.length;i+=CHUNK_MAX){
    await sock.sendMessage(chatId, { text: text.slice(i,i+CHUNK_MAX), ...(channelInfo||{}) }, { quoted });
  }
}

/* =======================
   Baileys v7 message helpers
======================= */
function unwrapMessage(msg) {
  let m = msg || {};
  for (let i=0; i<6; i++){
    if (m?.ephemeralMessage?.message){ m = m.ephemeralMessage.message; continue; }
    if (m?.viewOnceMessage?.message){ m = m.viewOnceMessage.message; continue; }
    if (m?.viewOnceMessageV2?.message){ m = m.viewOnceMessageV2.message; continue; }
    if (m?.viewOnceMessageV2Extension?.message){ m = m.viewOnceMessageV2Extension.message; continue; }
    if (m?.documentWithCaptionMessage?.message){ m = m.documentWithCaptionMessage.message; continue; }
    if (m?.editedMessage?.message){ m = m.editedMessage.message; continue; }
    break;
  }
  return m;
}

/* =======================
   Utils
======================= */
function humanSize(bytes=0){
  const b = Number(bytes)||0;
  if (b < 1024) return `${b} B`;
  const kb = b/1024; if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb/1024; if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb/1024; return `${gb.toFixed(2)} GB`;
}
function extFromMime(m=''){
  const mime = String(m||'').toLowerCase();
  if (!mime) return '.bin';
  if (mime.includes('jpeg')) return '.jpg';
  const t = mime.split('/')[1] || 'bin';
  return '.' + t.replace(/[^a-z0-9.+-]/g,'');
}
function kindEmojiByExt(ext=''){
  const e = ext.toLowerCase();
  if (['.jpg','.jpeg','.png','.gif','.webp','.bmp','.heic','.avif'].includes(e)) return ICON.img;
  if (['.mp4','.mkv','.mov','.webm','.avi','.3gp'].includes(e)) return ICON.vid;
  if (['.mp3','.ogg','.opus','.wav','.m4a','.flac','.aac'].includes(e)) return ICON.aud;
  if (e === '.webp') return ICON.stk;
  return ICON.doc;
}

/* =======================
   Media readers
======================= */
async function getMediaFromMessage(message) {
  const m = unwrapMessage(message.message || {});
  // image
  if (m.imageMessage) {
    const stream = await downloadContentFromMessage(m.imageMessage, 'image');
    const chunks = []; for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    const ext = extFromMime(m.imageMessage.mimetype || 'image/jpeg'); // -> .jpg
    const size = m.imageMessage.fileLength || buffer.length;
    return { buffer, ext, size, mimetype: m.imageMessage.mimetype || 'image/jpeg' };
  }
  // video
  if (m.videoMessage) {
    const stream = await downloadContentFromMessage(m.videoMessage, 'video');
    const chunks = []; for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    const ext = extFromMime(m.videoMessage.mimetype || 'video/mp4'); // -> .mp4
    const size = m.videoMessage.fileLength || buffer.length;
    return { buffer, ext, size, mimetype: m.videoMessage.mimetype || 'video/mp4' };
  }
  // audio/ptt
  if (m.audioMessage) {
    const stream = await downloadContentFromMessage(m.audioMessage, 'audio');
    const chunks = []; for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    // sering opus → pakai .ogg atau .opus; fallback .mp3 biar umum
    const mim = m.audioMessage.mimetype || 'audio/ogg';
    const ext = extFromMime(mim) || '.mp3';
    const size = m.audioMessage.fileLength || buffer.length;
    return { buffer, ext, size, mimetype: mim };
  }
  // document
  if (m.documentMessage) {
    const stream = await downloadContentFromMessage(m.documentMessage, 'document');
    const chunks = []; for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    const fileName = m.documentMessage.fileName || 'file.bin';
    const ext = path.extname(fileName) || extFromMime(m.documentMessage.mimetype || '') || '.bin';
    const size = m.documentMessage.fileLength || buffer.length;
    return { buffer, ext, size, mimetype: m.documentMessage.mimetype || 'application/octet-stream' };
  }
  // sticker
  if (m.stickerMessage) {
    const stream = await downloadContentFromMessage(m.stickerMessage, 'sticker');
    const chunks = []; for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);
    const ext = '.webp';
    const size = buffer.length;
    return { buffer, ext, size, mimetype: 'image/webp' };
  }
  return null;
}

async function getMediaFromQuoted(message) {
  const q = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
  if (!q) return null;
  return getMediaFromMessage({ message: q });
}

/* =======================
   Uploaders
======================= */
async function uploadViaTelegraphIfImage(tempPath, ext) {
  const e = (ext || '').toLowerCase();
  if (!['.jpg','.jpeg','.png','.gif','.webp'].includes(e)) return null; // Telegraph hanya gambar
  try {
    const url = await TelegraPh(tempPath);
    if (url && typeof url === 'string') return { url, host: 'Telegraph' };
  } catch (_) {}
  return null;
}

async function uploadViaUguu(tempPath) {
  const res = await UploadFileUgu(tempPath);
  const url = typeof res === 'string' ? res : (res.url || res.url_full || '');
  if (!url) throw new Error('Uguu upload failed');
  return { url, host: 'Uguu' };
}

/* =======================
   Command
======================= */
async function urlCommand(sock, chatId, message) {
  try {
    // Ambil media dari pesan saat ini → kalau tidak ada, coba dari quoted
    let media = await getMediaFromMessage(message);
    if (!media) media = await getMediaFromQuoted(message);

    if (!media) {
      const body =
        `${ICON.warn} Kirim atau *balas* media (gambar, video, audio, stiker, dokumen) untuk mendapatkan URL.\n\n` +
        `Contoh:\n` +
        `• Balas foto lalu ketik: *.url*\n` +
        `• Kirim dokumen lalu ketik: *.url*`;
      await chunkSend(sock, chatId, message, wrap('Panduan URL', body));
      return;
    }

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${Date.now()}${media.ext}`);
    fs.writeFileSync(tempPath, media.buffer);

    let out = { url: '', host: '' };
    try {
      // 1) Telegraph untuk gambar/webp — cepat & bersih
      const tg = await uploadViaTelegraphIfImage(tempPath, media.ext);
      if (tg && tg.url) out = tg;
      // 2) Fallback Uguu untuk semua tipe
      if (!out.url) out = await uploadViaUguu(tempPath);
    } finally {
      // Hapus temp
      setTimeout(() => { try { fs.existsSync(tempPath) && fs.unlinkSync(tempPath); } catch {} }, 1500);
    }

    if (!out.url) {
      await chunkSend(sock, chatId, message, wrap('Gagal Upload', `${ICON.err} Maaf, gagal mengunggah media.`));
      return;
    }

    // Build output rapi
    const kindIcon = kindEmojiByExt(media.ext);
    const body =
      `${ICON.ok} *Berhasil diunggah!*\n` +
      `${kindIcon} Jenis  : ${media.mimetype || media.ext}\n` +
      `${ICON.file} Ukuran : ${humanSize(media.size)}\n` +
      `🛰️ Host   : ${out.host}\n\n` +
      `${ICON.link} *URL:*\n` +
      '```' + out.url + '```\n\n' +
      `Tips: Tekan-tahan untuk *copy*. Bagikan link ini sesuai kebutuhan.`;

    await chunkSend(sock, chatId, message, wrap('URL Media', body));
  } catch (error) {
    console.error('[URL] error:', error?.message || error);
    const msg = `${ICON.err} Gagal mengonversi media menjadi URL.\nDetail: ${String(error?.message||error).slice(0,160)}`;
    await chunkSend(sock, chatId, message, wrap('Gagal', msg));
  }
}

module.exports = urlCommand;
