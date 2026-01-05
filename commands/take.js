// commands/take.js — set ulang EXIF stiker (pack|author) — Andika Bot style
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function bufferFromQuotedSticker(quoted) {
  const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
  const chunks = [];
  for await (const ch of stream) chunks.push(ch);
  return Buffer.concat(chunks);
}

/**
 * Cara pakai:
 * 1) Reply stiker
 * 2) Ketik: .take packname|author
 */
async function takeCommand(sock, chatId, message, args) {
  try {
    const q = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isSticker = !!q?.stickerMessage;

    if (!isSticker) {
      const txt = [
        '╭─〔 🧩 *TAKE STICKER EXIF* 〕',
        '│ Balas sebuah *stiker* lalu kirim:',
        '│ • *.take pack|author*',
        '│ ',
        '│ Contoh:',
        '│ • *.take AndikaBot|Mas Dika*',
        '╰───────────────────────────'
      ].join('\n');
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    const joined = (args || []).join(' ');
    const [pack, author] = joined.split('|').map(s => (s || '').trim());

    if (!pack) {
      const txt = [
        '╭─〔 🧩 *FORMAT TAKE SALAH* 〕',
        '│ Gunakan format:',
        '│ • *.take pack|author*',
        '│ ',
        '│ Contoh:',
        '│ • *.take AndikaBot|Mas Dika*',
        '╰───────────────────────────'
      ].join('\n');
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    // Ambil buffer webp dari stiker yang di-reply
    const webp = await bufferFromQuotedSticker(q);

    // Kirim ulang stiker dengan EXIF (packname/author) baru
    await sock.sendMessage(
      chatId,
      {
        sticker: webp,
        packname: pack,
        author: author || ''
      },
      { quoted: message }
    );
  } catch (err) {
    console.error('Error in take command:', err);
    const txt = [
      '╭─〔 ❌ *GAGAL TAKE* 〕',
      '│ Terjadi kesalahan saat mengubah EXIF stiker.',
      '│ Coba ulangi beberapa saat lagi.',
      '╰────────────────────────'
    ].join('\n');
    await sock.sendMessage(chatId, { text: txt }, { quoted: message });
  }
}

module.exports = takeCommand;
