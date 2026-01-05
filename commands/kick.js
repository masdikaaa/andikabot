const isAdmin = require('../lib/isAdmin');

async function kickCommand(sock, chatId, senderId, mentionedJids, message) {
    // Cek apakah pengirim adalah owner (dari device bot sendiri)
    const isOwner = message.key.fromMe;
    if (!isOwner) {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '⛔ *Jadikan bot sebagai admin terlebih dahulu.*' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '⚠️ *Hanya admin grup yang dapat memakai perintah kick.*' }, { quoted: message });
            return;
        }
    }

    let usersToKick = [];
    
    // Cek mention
    if (mentionedJids && mentionedJids.length > 0) {
        usersToKick = mentionedJids;
    }
    // Cek reply
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        usersToKick = [message.message.extendedTextMessage.contextInfo.participant];
    }
    
    // Jika tidak ada target
    if (usersToKick.length === 0) {
        await sock.sendMessage(chatId, { 
            text: '⚠️ *Harap mention user atau balas pesannya untuk menendang (kick)!*'
        }, { quoted: message });
        return;
    }

    // ID bot
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    // Jangan kick bot sendiri
    if (usersToKick.includes(botId)) {
        await sock.sendMessage(chatId, { 
            text: "🤖 *Aku nggak bisa kick diriku sendiri!*"
        }, { quoted: message });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(chatId, usersToKick, "remove");
        
        // Username untuk mention
        const usernames = await Promise.all(usersToKick.map(async jid => {
            return `@${jid.split('@')[0]}`;
        }));
        
        await sock.sendMessage(chatId, { 
            text: `✅ *Berhasil menendang:* ${usernames.join(', ')}`,
            mentions: usersToKick
        });
    } catch (error) {
        console.error('Error in kick command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Gagal menendang user.*'
        });
    }
}

module.exports = kickCommand;
