// commands/linkgroup.js — kirim link grup + QR code
'use strict';

const fetch = require('node-fetch');
const { channelInfo } = require('../lib/messageConfig');
const isAdmin = require('../lib/isAdmin');

/**
 * .linkgroup
 * - Hanya di grup
 * - Hanya admin / owner / sudo
 * - Bot harus admin (butuh akses inviteCode)
 */
async function linkGroupCommand(sock, chatId, senderId, message) {
  try {
    // Pastikan di grup
    if (!chatId.endsWith('@g.us')) {
      await sock.sendMessage(
        chatId,
        { text: '❌ Perintah ini hanya bisa dipakai di *grup*.', ...channelInfo },
        { quoted: message }
      );
      return;
    }

    // Cek admin & bot admin
    const adminStatus = await isAdmin(sock, chatId, senderId, message);
    const isSenderAdmin = adminStatus.isSenderAdmin || message.key.fromMe;
    const isBotAdmin = adminStatus.isBotAdmin;

    if (!isSenderAdmin) {
      await sock.sendMessage(
        chatId,
        { text: '🚫 *Khusus admin grup / owner bot*', ...channelInfo },
        { quoted: message }
      );
      return;
    }

    if (!isBotAdmin) {
      await sock.sendMessage(
        chatId,
        { text: '❌ Bot harus jadi *admin* untuk mengambil link grup.', ...channelInfo },
        { quoted: message }
      );
      return;
    }

    // Ambil metadata grup + invite code
    const meta = await sock.groupMetadata(chatId);
    const groupName = meta.subject || 'Grup';
    const inviteCode = await sock.groupInviteCode(chatId); // butuh bot admin
    const link = `https://chat.whatsapp.com/${inviteCode}`;

    // Caption utama
    const caption = [
      '╭─〔 🔗 *LINK GROUP* 〕',
      `│ 👥 Grup : *${groupName}*`,
      `│ 🌐 Link : ${link}`,
      '│ ',
      '│ 📌 Scan QR di atas untuk join langsung.',
      '╰────────────────────'
    ].join('\n');

    // Generate QR pakai API eksternal
    let qrBuffer = null;
    try {
      const qrUrl =
        'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=' +
        encodeURIComponent(link);
      const res = await fetch(qrUrl);
      if (res.ok) {
        qrBuffer = await res.buffer();
      }
    } catch (e) {
      console.warn('[linkgroup] gagal generate QR:', e?.message || e);
    }

    // Kalau QR berhasil di-generate → kirim image + caption
    if (qrBuffer) {
      await sock.sendMessage(
        chatId,
        {
          image: qrBuffer,
          caption,
          ...channelInfo
        },
        { quoted: message }
      );
      return;
    }

    // Fallback: kirim teks doang
    await sock.sendMessage(
      chatId,
      { text: caption, ...channelInfo },
      { quoted: message }
    );
  } catch (err) {
    console.error('[linkgroup] error:', err);
    await sock.sendMessage(
      chatId,
      { text: '❌ Gagal mengambil link grup.', ...channelInfo },
      { quoted: message }
    );
  }
}

module.exports = linkGroupCommand;
