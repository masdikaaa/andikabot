const { handleAntiBadwordCommand } = require('../lib/antibadword');

async function antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin) {
  try {
    if (!isSenderAdmin) {
      await sock.sendMessage(chatId, { 
        text: '⚠️ *Perintah ini hanya bisa dipakai oleh Admin Grup!*' 
      }, { quoted: message });
      return;
    }

    // Ambil argumen dari pesan (jaga semua varian teks)
    const fullText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      '';
    // buang prefix ".antibadword"
    const match = fullText.trim().split(/\s+/).slice(1).join(' ');

    await handleAntiBadwordCommand(sock, chatId, message, match);
  } catch (error) {
    console.error('Error di perintah antibadword:', error);
    await sock.sendMessage(chatId, { 
      text: '❌ *Terjadi kesalahan saat memproses perintah antibadword!*' 
    }, { quoted: message });
  }
}

module.exports = antibadwordCommand;
