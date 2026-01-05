const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

async function wastedCommand(sock, chatId, message) {
    let userToWaste;
    
    // Cek mention
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToWaste = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Cek balasan pesan
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToWaste = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToWaste) {
        await sock.sendMessage(
            chatId,
            { 
                text: '⚠️ Sebut (mention) seseorang atau balas pesan mereka untuk memberi efek wasted!',
                ...channelInfo 
            },
            { quoted: message }
        );
        return;
    }

    try {
        // Ambil foto profil pengguna
        let profilePic;
        try {
            profilePic = await sock.profilePictureUrl(userToWaste, 'image');
        } catch {
            profilePic = 'https://i.imgur.com/2wzGhpF.jpeg'; // Gambar default jika tidak ada foto profil
        }

        // Dapatkan gambar efek "wasted"
        const wastedResponse = await axios.get(
            `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(profilePic)}`,
            { responseType: 'arraybuffer' }
        );

        // Kirim gambar "wasted"
        await sock.sendMessage(chatId, {
            image: Buffer.from(wastedResponse.data),
            caption: `⚰️ *Wasted* : @${userToWaste.split('@')[0]} 💀\n\nIstirahatlah dalam kepingan!`,
            mentions: [userToWaste],
            ...channelInfo
        });

    } catch (error) {
        console.error('Error in wasted command:', error);
        await sock.sendMessage(
            chatId,
            { 
                text: '❌ Gagal membuat gambar wasted. Coba lagi nanti.',
                ...channelInfo 
            },
            { quoted: message }
        );
    }
}

module.exports = wastedCommand;
