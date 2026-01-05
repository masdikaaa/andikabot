const fetch = require('node-fetch');

async function stupidCommand(sock, chatId, quotedMsg, mentionedJid, sender, args) {
    try {
        // Tentukan target user
        let who = quotedMsg 
            ? quotedMsg.sender 
            : mentionedJid && mentionedJid[0] 
                ? mentionedJid[0] 
                : sender;

        // Teks untuk kartu (default: "im+stupid" bila tidak ada argumen)
        let text = args && args.length > 0 ? args.join(' ') : 'im+stupid';
        
        // Ambil foto profil target
        let avatarUrl;
        try {
            avatarUrl = await sock.profilePictureUrl(who, 'image');
        } catch (error) {
            console.error('Error fetching profile picture:', error);
            avatarUrl = 'https://telegra.ph/file/24fa902ead26340f3df2c.png'; // Avatar default
        }

        // Ambil gambar dari API
        const apiUrl = `https://some-random-api.com/canvas/misc/its-so-stupid?avatar=${encodeURIComponent(avatarUrl)}&dog=${encodeURIComponent(text)}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        // Buffer gambar
        const imageBuffer = await response.buffer();

        // Kirim gambar
        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: `*@${who.split('@')[0]}*`,
            mentions: [who]
        });

    } catch (error) {
        console.error('Error in stupid command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Maaf, aku tidak bisa membuat kartu itu sekarang. Coba lagi nanti ya!'
        });
    }
}

module.exports = { stupidCommand };
