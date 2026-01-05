// commands/unmute.js
const { channelInfo } = require('../lib/messageConfig');
const isAdmin = require('../lib/isAdmin');

async function unmuteCommand(sock, chatId, senderId, message) {
  try {
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
      await sock.sendMessage(chatId, {
        text: '⛔ *Jadikan bot sebagai admin terlebih dahulu!*',
        ...channelInfo
      }, { quoted: message });
      return;
    }

    if (!isSenderAdmin) {
      await sock.sendMessage(chatId, {
        text: '⚠️ *Hanya admin grup yang dapat menggunakan perintah unmute!*',
        ...channelInfo
      }, { quoted: message });
      return;
    }

    // Ubah mode agar semua anggota bisa chat
    await sock.groupSettingUpdate(chatId, 'not_announcement');

    const caption =
`╭──────────────────────────
│ 🔔 *GRUP DIBUKA!*
│ 👤 Oleh: @${senderId.split('@')[0]}
│ 📅 ${new Date().toLocaleString('id-ID')}
╰──────────────────────────
💬 *Semua anggota kini dapat mengirim pesan kembali.*`;

    await sock.sendMessage(chatId, {
      text: caption,
      mentions: [senderId],
      ...channelInfo
    }, { quoted: message });

  } catch (error) {
    console.error('❌ Error di perintah unmute:', error);
    await sock.sendMessage(chatId, {
      text: '❌ *Gagal membuka grup (unmute). Coba lagi nanti!*',
      ...channelInfo
    }, { quoted: message });
  }
}

module.exports = unmuteCommand;
