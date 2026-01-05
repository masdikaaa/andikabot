const isAdmin = require('../lib/isAdmin');  // Move isAdmin to helpers

async function tagAllCommand(sock, chatId, senderId) {
    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isSenderAdmin && !isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: '⚠️ Hanya admin yang dapat menggunakan perintah .tagall.'
            });
            return;
        }

        // Get group metadata
        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: '🙅‍♂️ Tidak ada peserta di grup ini.' });
            return;
        }

        // Create message with each member on a new line
        let message = '🔊 *Halo Semuanya!* 🎉\n\n';
        participants.forEach(participant => {
            message += `👤 @${participant.id.split('@')[0]}\n`; // Add \n for new line
        });

        // Send message with mentions
        await sock.sendMessage(chatId, {
            text: message,
            mentions: participants.map(p => p.id)
        });

    } catch (error) {
        console.error('Error in tagall command:', error);
        await sock.sendMessage(chatId, { text: '❌ Gagal menandai semua anggota.' });
    }
}

module.exports = tagAllCommand;  // Export directly
