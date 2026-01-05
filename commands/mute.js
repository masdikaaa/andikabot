// commands/mute.js
const { channelInfo } = require('../lib/messageConfig');
const isAdmin = require('../lib/isAdmin');

async function muteCommand(sock, chatId, senderId, message, durationInMinutes) {
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
        text: '⚠️ *Hanya admin grup yang dapat menggunakan perintah mute!*',
        ...channelInfo
      }, { quoted: message });
      return;
    }

    // Update ke mode announcement (hanya admin bisa chat)
    await sock.groupSettingUpdate(chatId, 'announcement');

    const waktu = durationInMinutes && durationInMinutes > 0
      ? `${durationInMinutes} menit`
      : 'tanpa batas waktu';

    const caption =
`╭──────────────────────────
│ 🔇 *GRUP DIMUTE!*
│ 👤 Oleh: @${senderId.split('@')[0]}
│ ⏱️ Durasi: ${waktu}
│ 📅 ${new Date().toLocaleString('id-ID')}
╰──────────────────────────
💬 *Hanya admin yang dapat mengirim pesan selama periode ini.*`;

    await sock.sendMessage(chatId, {
      text: caption,
      mentions: [senderId],
      ...channelInfo
    }, { quoted: message });

    // Jika ada durasi, auto unmute
    if (durationInMinutes && durationInMinutes > 0) {
      const durationMs = durationInMinutes * 60 * 1000;
      setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(chatId, 'not_announcement');
          const unmuteMsg =
`╭──────────────────────────
│ 🔔 *GRUP DIBUKA!*
│ ⏰ Durasi mute telah berakhir.
│ 📅 ${new Date().toLocaleString('id-ID')}
╰──────────────────────────
💬 *Semua anggota kini dapat mengirim pesan kembali.*`;
          await sock.sendMessage(chatId, { text: unmuteMsg, ...channelInfo });
        } catch (err) {
          console.error('Error unmuting group:', err);
        }
      }, durationMs);
    }
  } catch (error) {
    console.error('❌ Error di perintah mute:', error);
    await sock.sendMessage(chatId, {
      text: '❌ *Terjadi kesalahan saat mute grup. Coba lagi nanti!*',
      ...channelInfo
    }, { quoted: message });
  }
}

module.exports = muteCommand;
