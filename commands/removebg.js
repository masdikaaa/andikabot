// commands/removebg.js
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadImage } = require('../lib/uploadImage');

const API_BASE = 'https://api.dreaded.site/api/removebg';

/* ====== Style helpers (Andika Bot look) ====== */
const LINE = '─'.repeat(34);
const box = (title, lines = []) =>
  `╭─〔 ${title} 〕\n${lines.map(l => `│ ${l}`).join('\n')}\n╰${LINE}`;

/* ====== Utils ====== */
function isValidUrl(s) { try { new URL(s); return true; } catch { return false; } }

async function getQuotedOrOwnImageUrl(message) {
  try {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const take = quoted?.imageMessage ? quoted.imageMessage : message.message?.imageMessage;
    if (!take) return null;

    const stream = await downloadContentFromMessage(take, 'image');
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const buffer = Buffer.concat(chunks);

    // upload ke host publik → dapat URL langsung
    return await uploadImage(buffer);
  } catch (e) {
    console.error('[removebg] getQuotedOrOwnImageUrl:', e.message);
    return null;
  }
}

async function sendImageBuffer(sock, chatId, quoted, buf, mimetype = 'image/png') {
  await sock.sendMessage(
    chatId,
    {
      image: Buffer.isBuffer(buf) ? buf : Buffer.from(buf),
      mimetype,
      caption: '✨ Background berhasil dihapus!'
    },
    { quoted }
  );
}

module.exports = {
  name: 'removebg',
  alias: ['rmbg', 'nobg'],
  category: 'general',
  desc: 'Remove background dari gambar',
  async exec(sock, message, args) {
    const chatId = message.key.remoteJid;

    // --- Ambil URL gambar (argumen / quoted / caption) ---
    let imageUrl;
    if (args.length > 0) {
      const url = args.join(' ').trim();
      if (!isValidUrl(url)) {
        await sock.sendMessage(
          chatId,
          { text: box('❌ URL TIDAK VALID', [
              'Contoh:',
              '.removebg https://example.com/image.jpg'
            ]) },
          { quoted: message }
        );
        return;
      }
      imageUrl = url;
    } else {
      imageUrl = await getQuotedOrOwnImageUrl(message);
      if (!imageUrl) {
        await sock.sendMessage(
          chatId,
          { text: box('🖼️ REMOVE BACKGROUND', [
              'Cara pakai:',
              '• .removebg <image_url>',
              '• Balas gambar dengan .removebg',
              '• Kirim gambar + caption .removebg',
              '',
              'Contoh:',
              '.removebg https://example.com/image.jpg'
            ]) },
          { quoted: message }
        );
        return;
      }
    }

    try {
      // --- Panggil API ---
      const apiUrl = `${API_BASE}?imageurl=${encodeURIComponent(imageUrl)}`;
      const res = await axios.get(apiUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const ctype = String(res.headers['content-type'] || '');

      // (1) Server kirim langsung image
      if (ctype.startsWith('image/')) {
        await sendImageBuffer(sock, chatId, message, res.data, ctype);
        return;
      }

      // (2) Server kirim JSON → cek base64 / link hasil
      let text = '';
      try { text = Buffer.from(res.data).toString('utf8'); } catch {}
      let json;
      try { json = JSON.parse(text); } catch {}

      if (json) {
        if (json.imageBase64 && typeof json.imageBase64 === 'string') {
          const b64 = json.imageBase64.replace(/^data:image\/\w+;base64,/, '');
          const buf = Buffer.from(b64, 'base64');
          await sendImageBuffer(sock, chatId, message, buf, 'image/png');
          return;
        }

        const directUrl = json.url || json.resultUrl || json.result?.url;
        if (typeof directUrl === 'string' && /^https?:\/\//i.test(directUrl)) {
          const d = await axios.get(directUrl, { responseType: 'arraybuffer' });
          await sendImageBuffer(sock, chatId, message, d.data, d.headers['content-type'] || 'image/png');
          return;
        }
      }

      // (3) Format tak dikenali
      console.error('[removebg] Unexpected API response:', ctype, text?.slice(0, 200));
      await sock.sendMessage(
        chatId,
        { text: box('❌ GAGAL MEMPROSES', [
            'Server mengembalikan respons tidak dikenal.'
          ]) },
        { quoted: message }
      );
    } catch (error) {
      console.error('RemoveBG Error:', error?.response?.status, error?.message);

      let body = ['Terjadi kesalahan saat menghapus background.'];
      if (error.response?.status === 429) body = ['Terlalu banyak permintaan. Coba lagi nanti.'];
      else if (error.response?.status === 400) body = ['URL atau format gambar tidak valid.'];
      else if (error.response?.status >= 500) body = ['Server bermasalah. Coba lagi nanti.'];
      else if (error.code === 'ECONNABORTED') body = ['Timeout. Coba lagi.'];
      else if (/(ENOTFOUND|ECONNREFUSED)/.test(error.message || '')) body = ['Gangguan jaringan. Periksa koneksi.'];

      await sock.sendMessage(
        chatId,
        { text: box('❌ GAGAL', body) },
        { quoted: message }
      );
    }
  }
};
