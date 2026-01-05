const isAdmin = require('../lib/isAdmin');

async function tagNotAdminCommand(sock, chatId, senderId, message) {
    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '⚠️ Tolong jadikan bot sebagai admin terlebih dahulu.' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '⚠️ Hanya admin yang dapat menggunakan perintah .tagnotadmin.' }, { quoted: message });
            return;
        }

        const groupMetadata = await sock.groupMetadata(chatId);
        const participants = groupMetadata.participants || [];

        const nonAdmins = participants.filter(p => !p.admin).map(p => p.id);
        if (nonAdmins.length === 0) {
            await sock.sendMessage(chatId, { text: '🙌 Tidak ada anggota non-admin untuk ditag.' }, { quoted: message });
            return;
        }

        let text = '🔊 *Halo Semua:* 🎉\n\n';
        nonAdmins.forEach(jid => {
            text += `👤 @${jid.split('@')[0]}\n`;
        });

        await sock.sendMessage(chatId, { text, mentions: nonAdmins }, { quoted: message });
    } catch (error) {
        console.error('Error in tagnotadmin command:', error);
        await sock.sendMessage(chatId, { text: '❌ Gagal menandai anggota non-admin.' }, { quoted: message });
    }
}

module.exports = tagNotAdminCommand;
