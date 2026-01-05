// commands/text2qr.js
const axios = require('axios');
const API_ENDPOINT = 'https://zelapioffciall.koyeb.app/tools/text2qr';

// (opsional) ikut style channelInfo kalau ada
let channelInfo = {};
try {
  ({ channelInfo } = require('../lib/messageConfig'));
} catch (_) {
  channelInfo = {};
}

// Ambil teks dari pesan / reply
function extractText(message) {
  const msg = message.message || {};
  const fromBody =
    msg.conversation?.trim() ||
    msg.extendedTextMessage?.text?.trim() ||
    msg.imageMessage?.caption?.trim() ||
    msg.videoMessage?.caption?.trim() ||
    '';

  // kalau reply teks, pakai quoted
  const quoted = msg.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText =
    quoted?.conversation?.trim() ||
    quoted?.extendedTextMessage?.text?.trim() ||
    '';

  // Prioritas:
  // - Jika user pakai command + teks → pakai yang setelah command
  // - Kalau ga ada, tapi reply teks → pakai reply
  // - Kalau ga ada semua → kosong
  return { fromBody, quotedText };
}

async function callApiReturnBuffer(text) {
  // 1) Coba POST → bisa jadi API langsung balas image/binary
  try {
    const res = await axios.post(
      API_ENDPOINT,
      { text },
      {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'image/*,application/json;q=0.9,*/*;q=0.8',
        },
        timeout: 20000
      }
    );

    const ct = String(res.headers['content-type'] || '').toLowerCase();

    // Kalau langsung image
    if (ct.startsWith('image/')) {
      return Buffer.from(res.data);
    }

    // Kalau JSON → cek berbagai kemungkinan shape
    if (ct.includes('application/json')) {
      const json = JSON.parse(Buffer.from(res.data).toString('utf8'));

      // kemungkinan1: { url: "https://..." }
      if (json.url) {
        const img = await axios.get(json.url, { responseType: 'arraybuffer', timeout: 20000 });
        return Buffer.from(img.data);
      }

      // kemungkinan2: { image: "data:image/png;base64,...." } atau { data: "base64..." }
      const b64 = json.image || json.data || json.buffer || json.base64;
      if (typeof b64 === 'string') {
        const m = b64.match(/^data:image\/\w+;base64,(.+)$/i);
        return Buffer.from(m ? m[1] : b64, 'base64');
      }

      throw new Error('API JSON tidak berisi url/base64 image.');
    }

    // Kalau bukan image/json, anggap error
    throw new Error(`Unexpected content-type: ${ct}`);
  } catch (e) {
    // lanjut ke GET fallback
  }

  // 2) Fallback GET ?text=
  const res2 = await axios.get(API_ENDPOINT, {
    params: { text },
    responseType: 'arraybuffer',
    headers: { 'Accept': 'image/*,*/*;q=0.8' },
    timeout: 20000
  });

  const ct2 = String(res2.headers['content-type'] || '').toLowerCase();
  if (!ct2.startsWith('image/')) {
    // Kalau ternyata JSON, coba parse & ambil url/base64
    if (ct2.includes('application/json')) {
      const json = JSON.parse(Buffer.from(res2.data).toString('utf8'));
      if (json.url) {
        const img = await axios.get(json.url, { responseType: 'arraybuffer', timeout: 20000 });
        return Buffer.from(img.data);
      }
      const b64 = json.image || json.data || json.buffer || json.base64;
      if (typeof b64 === 'string') {
        const m = b64.match(/^data:image\/\w+;base64,(.+)$/i);
        return Buffer.from(m ? m[1] : b64, 'base64');
      }
    }
    throw new Error('API tidak mengembalikan gambar.');
  }

  return Buffer.from(res2.data);
}

async function text2qrCommand(sock, chatId, message) {
  try {
    const raw =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      '';

    // ambil teks setelah command (.qr / .text2qr)
    const lowered = raw.trim().toLowerCase();
    let inputText = '';
    if (lowered.startsWith('.qr') || lowered.startsWith('.text2qr')) {
      inputText = raw.replace(/^(\.qr|\.text2qr)\s*/i, '').trim();
    }

    // fallback ke reply teks bila tak ada argumen
    if (!inputText) {
      const { quotedText } = extractText(message);
      inputText = quotedText;
    }

    if (!inputText) {
      await sock.sendMessage(
        chatId,
        {
          text: [
            '🧩 *TEXT ➜ QR CODE*',
            '',
            'Cara pakai:',
            '• `.qr <teks>`',
            '• `.text2qr <teks>`',
            '• atau balas teks lalu ketik `.qr`',
            '',
            'Contoh:',
            '• `.qr https://example.com`',
            '• Balas: "Halo dunia" → `.qr`'
          ].join('\n'),
          ...channelInfo
        },
        { quoted: message }
      );
      return;
    }

    // Bikin QR via API
    const imgBuf = await callApiReturnBuffer(inputText);

    // Kirim ke WA
    await sock.sendMessage(
      chatId,
      {
        image: imgBuf,
        caption: [
          '✅ *QR Code Berhasil Dibuat!*',
          '',
          `🔗 *Data:* ${inputText.length > 200 ? inputText.slice(0, 200) + '…' : inputText}`
        ].join('\n'),
        ...channelInfo
      },
      { quoted: message }
    );
  } catch (err) {
    console.error('Error in text2qr:', err?.message || err);
    await sock.sendMessage(
      chatId,
      {
        text: '❌ *Gagal membuat QR.* Coba lagi beberapa saat, atau cek teks/URL yang kamu kirim.',
        ...channelInfo
      },
      { quoted: message }
    );
  }
}

module.exports = { text2qrCommand };
