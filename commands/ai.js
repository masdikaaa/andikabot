// commands/ai.js — Andika Bot style (Bahasa Indonesia, Baileys v7)
// Fitur: header brand, react, typing, anti-duplikat, fallback API terstruktur, timeout aman
'use strict';

const axios = require('axios');
const fetch = require('node-fetch');
const { channelInfo } = require('../lib/messageConfig'); // badge/forwarded style Andika Bot

// =======================
// BRANDING & THEME
// =======================
const BRAND = 'Andika Bot';
const ICON  = { bot: '🤖', warn: '⚠️', ok: '✅', err: '❌', spark: '✨' };

const HEAD = (title) =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

const STAMP = () => new Date().toLocaleString('id-ID', { hour12: false });

// =======================
// HELPERS
// =======================

/** Ambil teks pertanyaan dari pesan/quoted */
function extractText(message) {
  const direct = message?.message?.conversation
    || message?.message?.extendedTextMessage?.text
    || message?.message?.imageMessage?.caption
    || message?.message?.videoMessage?.caption;

  // Kalau user reply pesan, ambil teks dari quoted jika ada
  const quoted =
    message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
    || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text
    || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption
    || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage?.caption;

  // Prioritaskan teks setelah command; fallback ke quoted
  return direct || quoted || '';
}

/** Normalisasi jawaban dari berbagai skema API */
function pickAnswer(data) {
  if (!data) return null;
  // Urutan prioritas field yang sering dipakai oleh berbagai API gratis
  return (
    data.answer ||
    data.result ||
    data.message ||
    data.data ||
    data.output ||
    (typeof data === 'string' ? data : null)
  );
}

/** Kirim teks dengan style Andika Bot + badge channel */
async function sendStyled(sock, chatId, message, title, body) {
  const text =
`${HEAD(title)}
${body}

${ICON.spark} ${STAMP()}`;
  return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
}

// =======================
// ANTI DUPLIKAT
// =======================
const processedMessages = new Set();
function oncePerMessage(messageId, ttlMs = 5 * 60 * 1000) {
  if (!messageId) return false;
  if (processedMessages.has(messageId)) return false;
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), ttlMs);
  return true;
}

// =======================
// MAIN COMMAND
// =======================
async function aiCommand(sock, chatId, message) {
  try {
    const mId = message?.key?.id;
    if (!oncePerMessage(mId)) return;

    // Indikasi mengetik & react awal
    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}
    try { await sock.sendMessage(chatId, { react: { text: ICON.bot, key: message.key } }); } catch {}

    // Ambil teks & command
    const rawText = extractText(message).trim();
    if (!rawText) {
      return sendStyled(
        sock,
        chatId,
        message,
        'Bantuan AI',
        `Tolong tuliskan pertanyaan setelah perintah.
Contoh:
• .gpt buatkan ringkasan Balanced Scorecard
• .gemini tulis HTML sederhana untuk kartu profil`
      );
    }

    const parts   = rawText.split(' ');
    const command = parts[0]?.toLowerCase();
    const query   = parts.slice(1).join(' ').trim();

    // Jika user hanya mengetik .gpt atau .gemini tanpa pertanyaan
    if (!query || !command.startsWith('.')) {
      return sendStyled(
        sock,
        chatId,
        message,
        'Format Perintah',
        `Gunakan perintah berikut:
• .gpt <pertanyaan>
• .gemini <pertanyaan>

Contoh:
.gpt jelaskan perbedaan load balancer L4 vs L7
.gemini buatkan caption welcome grup yang sopan`
      );
    }

    // =======================
    // KONFIGURASI REQUEST
    // =======================
    const AX = axios.create({
      timeout: 15_000, // 15 detik
      validateStatus: () => true
    });

    // =======================
    // HANDLER GPT
    // =======================
    async function handleGPT(q) {
      // Single endpoint agar stabil (bisa diganti ke endpoint Mas Andika sendiri)
      const url = `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(q)}`;
      const res = await AX.get(url).catch(() => null);
      const data = res?.data || null;

      if (!data || res.status !== 200 || (!data.status && !data.success)) {
        throw new Error('Respons API tidak valid / status bukan 200');
      }

      const answer = pickAnswer(data);
      if (!answer) throw new Error('Jawaban tidak ditemukan pada payload API');

      return String(answer).trim();
    }

    // =======================
    // HANDLER GEMINI (FALLBACK BERURUT)
    // =======================
    async function handleGemini(q) {
      const endpoints = [
        // Urutan fallback paling stabil/cepat di atas
        `https://vapis.my.id/api/gemini?q=${encodeURIComponent(q)}`,
        `https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(q)}`,
        // Beberapa API mengembalikan format mirip GPT
        `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(q)}`,
        // Gifted (butuh apikey bila limit ketat)
        `https://api.giftedtech.my.id/api/ai/geminiai?apikey=gifted&q=${encodeURIComponent(q)}`,
        `https://api.giftedtech.my.id/api/ai/geminiaipro?apikey=gifted&q=${encodeURIComponent(q)}`
      ];

      for (const url of endpoints) {
        try {
          // Pakai fetch agar ringan dan toleran terhadap variasi header
          const r = await fetch(url, { method: 'GET', timeout: 15000 });
          const data = await r.json().catch(() => null);
          const answer = pickAnswer(data);

          if (r.ok && answer) {
            return String(answer).trim();
          }
        } catch {
          // lanjut ke endpoint berikutnya
          continue;
        }
      }
      throw new Error('Semua endpoint Gemini gagal dijangkau');
    }

    // =======================
    // EKSEKUSI SESUAI COMMAND
    // =======================
    let title = 'Jawaban AI';
    let reply = '';

    if (command === '.gpt') {
      title = 'GPT (Andika Bot)';
      reply = await handleGPT(query);
    } else if (command === '.gemini') {
      title = 'Gemini (Andika Bot)';
      reply = await handleGemini(query);
    } else {
      // Jika bukan dua-duanya, tampilkan panduan singkat
      return sendStyled(
        sock,
        chatId,
        message,
        'Perintah Tidak Dikenali',
        `Gunakan:
• .gpt <pertanyaan>
• .gemini <pertanyaan>

Contoh:
.gpt jelaskan perbedaan CDN vs Reverse Proxy
.gemini buatkan template pesan welcome grup`
      );
    }

    // Finishing: kirim jawaban
    if (!reply || reply.length < 2) {
      throw new Error('Jawaban kosong / terlalu pendek');
    }

    await sendStyled(sock, chatId, message, title, reply);

  } catch (err) {
    console.error('AI Command Error:', err);
    // Pesan error yang konsisten, Bahasa Indonesia, badge channel
    const body =
`${ICON.err} Maaf, terjadi kendala saat memproses permintaan Anda.

Tips:
• Coba ulang dengan kalimat yang lebih spesifik.
• Hindari spam perintah berurutan sangat cepat.
• Jika terus gagal, gunakan perintah lain atau coba beberapa menit lagi.`;

    try {
      await sendStyled(
        sock,
        chatId,
        message,
        'Gagal Memproses',
        body
      );
    } catch {}
  } finally {
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
  }
}

module.exports = aiCommand;
