// commands/translate.js — CF Translation (Siputzx) + fallback + style Andika Bot
'use strict';

const fetch = require('node-fetch');

/* ===== Utility kecil buat tampilan ===== */
function nowID() {
  return new Date().toLocaleString('id-ID', { hour12: false });
}

function preview(str = '', n = 600) {
  const s = String(str).trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function isLangCode(s = '') {
  return /^[a-z]{2}$/i.test(s.trim());
}

function usageText() {
  return (
`╭────────────────────────
│ 🌐 *PENERJEMAH*
│ 🗓️ ${nowID()}
╰────────────────────────

💬 *Balas pesan*:
• *.translate <kode>*  atau  *.trt <kode>*
  Contoh: balas pesan → *.trt id*  (auto ➝ Indonesia)
  Contoh: balas pesan → *.trt id en*  (Indonesia ➝ Inggris)

⌨️ *Ketik langsung*:
• *.trt <kode> <teks>*
  Contoh: *.trt en selamat pagi kawan*

• *.trt <src> <dst> <teks>*
  Contoh: *.trt id en tolong patuhi aturan grub*

🔤 *Kode umum*: en, id, fr, es, de, it, pt, ru, ja, ko, zh, ar, hi

ℹ️ Sumber bahasa bisa auto, target pakai kode yang kamu isi.`
  );
}

/**
 * Deteksi kasar sourceLang kalau user nggak isi.
 * Supaya kita *tidak* kirim "auto" ke CF (bisa bikin 500).
 */
function guessSourceLang(text, prefer = '') {
  if (prefer && prefer.toLowerCase() !== 'auto') {
    return prefer.toLowerCase();
  }

  const lower = (text || '').toLowerCase();

  const idWords = [
    'yang', 'tidak', 'nggak', 'gak', 'kamu', 'kalian', 'saya', 'aku',
    'tolong', 'aturan', 'grub', 'selamat', 'pagi', 'siang', 'malam',
    'terimakasih', 'terima kasih', 'bang', 'bro', 'aja', 'dong', 'nih'
  ];
  const enWords = [
    'the', 'and', 'you', 'please', 'hello', 'hi ', 'rule', 'rules',
    'group', 'good', 'morning', 'evening', 'night', 'thanks', 'thank you'
  ];

  let scoreId = 0;
  let scoreEn = 0;

  for (const w of idWords) if (lower.includes(w)) scoreId++;
  for (const w of enWords) if (lower.includes(w)) scoreEn++;

  if (scoreId > scoreEn) return 'id';
  if (scoreEn > scoreId) return 'en';

  // Default ke Indonesia (lebih sering dipakai)
  return 'id';
}

/* ====== Pemanggilan API ====== */

async function translateViaCF(text, sourceLang, targetLang) {
  const baseUrl = 'https://api.siputzx.my.id/api/cf/translation';

  const url =
    `${baseUrl}?text=${encodeURIComponent(text)}` +
    `&sourceLang=${encodeURIComponent(sourceLang)}` +
    `&targetLang=${encodeURIComponent(targetLang)}` +
    `&model=${encodeURIComponent('@cf/meta/m2m100-1.2b')}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': '*/*'
    }
  });

  const bodyText = await res.text();

  if (!res.ok) {
    console.error('[CF-TRANSLATE] HTTP', res.status, bodyText);
    throw new Error(`HTTP ${res.status}`);
  }

  let json;
  try {
    json = JSON.parse(bodyText);
  } catch (e) {
    console.error('[CF-TRANSLATE] JSON parse error:', e, bodyText);
    throw new Error('Invalid JSON from CF');
  }

  if (!json.status || !json.data || !json.data.translated_text) {
    console.error('[CF-TRANSLATE] Response tidak lengkap:', json);
    throw new Error('Bad response from CF');
  }

  return String(json.data.translated_text);
}

// Fallback 1: Google (auto detect)
async function translateViaGoogle(text, targetLang) {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} Google`);

  const data = await res.json();
  if (data && data[0] && data[0][0] && data[0][0][0]) {
    return String(data[0][0][0]);
  }
  throw new Error('Bad response Google');
}

// Fallback 2: MyMemory
async function translateViaMyMemory(text, targetLang) {
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}&langpair=auto|${encodeURIComponent(targetLang)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} MyMemory`);

  const data = await res.json();
  if (data && data.responseData && data.responseData.translatedText) {
    return String(data.responseData.translatedText);
  }
  throw new Error('Bad response MyMemory');
}

/* ===== Handler utama command ===== */

async function handleTranslateCommand(sock, chatId, message, match = '') {
  try {
    // indikator mengetik
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);

    const raw = (match || '').trim();
    let sourceLang = '';   // boleh kosong → auto guess
    let targetLang = '';
    let textToTranslate = '';

    const quotedMessage =
      message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (quotedMessage) {
      // Ambil teks dari pesan yang dibalas
      textToTranslate =
        quotedMessage.conversation ||
        quotedMessage.extendedTextMessage?.text ||
        quotedMessage.imageMessage?.caption ||
        quotedMessage.videoMessage?.caption ||
        '';

      const parts = raw.split(/\s+/).filter(Boolean);

      if (!parts.length) {
        // user cuma tulis ".trt" tanpa argumen
        return sock.sendMessage(
          chatId,
          { text: usageText() },
          { quoted: message }
        );
      }

      if (parts.length === 1) {
        targetLang = parts[0];                   // ex: .trt id
      } else {
        sourceLang = parts[0];                   // ex: .trt id en
        targetLang = parts[1];
      }

    } else {
      // Tidak reply, parsing dari teks command
      const parts = raw.split(/\s+/).filter(Boolean);

      if (parts.length < 2) {
        return sock.sendMessage(
          chatId,
          { text: usageText() },
          { quoted: message }
        );
      }

      // Pola 1: .trt id en <teks>
      if (
        parts.length >= 3 &&
        isLangCode(parts[0]) &&
        isLangCode(parts[1])
      ) {
        sourceLang = parts[0];
        targetLang = parts[1];
        textToTranslate = parts.slice(2).join(' ');
      } else {
        // Pola 2: .trt en <teks>
        targetLang = parts[0];
        textToTranslate = parts.slice(1).join(' ');
      }
    }

    if (!targetLang) {
      return sock.sendMessage(
        chatId,
        { text: usageText() },
        { quoted: message }
      );
    }

    if (!textToTranslate) {
      return sock.sendMessage(
        chatId,
        {
          text: '❌ Tidak ada teks yang bisa diterjemahkan. Kirim teks atau balas pesan yang berisi teks.',
        },
        { quoted: message }
      );
    }

    // Pastikan sourceLang yang dikirim ke CF bukan "auto"
    const src = guessSourceLang(textToTranslate, (sourceLang || '').toLowerCase());
    const dst = targetLang.toLowerCase();

    let translatedText = null;
    let lastError = null;

    // 1) CF Translation (utama)
    try {
      translatedText = await translateViaCF(textToTranslate, src, dst);
    } catch (e) {
      lastError = e;
      console.error('❌ CF translate gagal:', e);
    }

    // 2) Fallback Google
    if (!translatedText) {
      try {
        translatedText = await translateViaGoogle(textToTranslate, dst);
      } catch (e) {
        lastError = e;
        console.error('❌ Google translate gagal:', e);
      }
    }

    // 3) Fallback MyMemory
    if (!translatedText) {
      try {
        translatedText = await translateViaMyMemory(textToTranslate, dst);
      } catch (e) {
        lastError = e;
        console.error('❌ MyMemory translate gagal:', e);
      }
    }

    if (!translatedText) {
      throw lastError || new Error('Semua API terjemahan gagal');
    }

    const styled =
`╭────────────────────────
│ 🌐 *PENERJEMAH*
│ 🗓️ ${nowID()}
│ 🔁 ${src.toUpperCase()} → ${dst.toUpperCase()}
╰────────────────────────

📥 *Teks Asli:*
${'```'}${preview(textToTranslate)}${'```'}

✅ *Hasil:*
*${translatedText}*

—
💡 Contoh:
• Balas pesan → *.trt id*
• Balas pesan → *.trt id en*
• Ketik       → *.trt en selamat pagi*`;

    await sock.sendMessage(
      chatId,
      { text: styled },
      { quoted: message }
    );
  } catch (error) {
    console.error('❌ Error translate (CF):', error);
    await sock.sendMessage(
      chatId,
      {
        text:
`❌ *Gagal menerjemahkan teks.* Coba lagi nanti.

${usageText()}`
      },
      { quoted: message }
    );
  }
}

module.exports = {
  handleTranslateCommand
};
