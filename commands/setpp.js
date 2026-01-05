// commands/setpp.js
const fs = require('fs');
const path = require('path');
const {
  downloadContentFromMessage,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

async function setProfilePicture(sock, chatId, msg) {
  try {
    const senderId = msg.key.participant || msg.key.remoteJid;

    // --- izin: owner / sudo / admin / owner grup ---
    let allow = !!msg.key.fromMe; // owner bot
    try { if (await isSudo(senderId)) allow = true; } catch {}
    if (chatId.endsWith('@g.us')) {
      try {
        const meta = await sock.groupMetadata(chatId);
        const adm  = await isAdmin(sock, chatId, senderId, msg);
        if (adm.isSenderAdmin) allow = true;
        if (meta.owner && meta.owner === senderId) allow = true;
      } catch {}
    }
    if (!allow) {
      await sock.sendMessage(chatId, { text: '⛔ *Perintah ini hanya untuk owner/sudo/admin/owner grup!*' }, { quoted: msg });
      return;
    }
    // -------------------------------------------------

    // sumber gambar: caption .setpp atau reply
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedImage = quoted?.imageMessage || null;
    const inlineImage = msg.message?.imageMessage || null;
    const imageMessage = inlineImage || quotedImage;

    if (!imageMessage) {
      await sock.sendMessage(
        chatId,
        { text: '⚠️ *Kirim gambar dengan caption `.setpp` atau balas gambar dengan `.setpp`!*' },
        { quoted: msg }
      );
      return;
    }

    // download → file sementara
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const stream = await downloadContentFromMessage(imageMessage, 'image');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const imagePath = path.join(tmpDir, `profile_${Date.now()}.jpg`);
    fs.writeFileSync(imagePath, buffer);

    // ⬅️ KIRIM MEDIA OBJECT LANGSUNG ke updateProfilePicture (bukan hasil generate)
    const botJid = jidNormalizedUser(sock.user.id) || (sock.user.id.split(':')[0] + '@s.whatsapp.net');
    await sock.updateProfilePicture(botJid, { url: imagePath });

    try { fs.unlinkSync(imagePath); } catch {}

    await sock.sendMessage(chatId, { text: '✅ *Foto profil bot berhasil diperbarui!*' }, { quoted: msg });
  } catch (err) {
    console.error('Error in setpp command:', err);
    await sock.sendMessage(chatId, { text: '❌ *Gagal memperbarui foto profil!*' }, { quoted: msg });
  }
}

module.exports = setProfilePicture;
