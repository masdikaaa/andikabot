const fetch = require('node-fetch');

async function simpCommand(sock, chatId, quotedMsg, mentionedJid, sender) {
    try {
        // Tentukan target user
        let who = quotedMsg 
            ? quotedMsg.sender 
            : mentionedJid && mentionedJid[0] 
                ? mentionedJid[0] 
                : sender;

        // Ambil URL foto profil
        let avatarUrl;
        try {
            avatarUrl = await sock.profilePictureUrl(who, 'image');
        } catch (error) {
            console.error('Error fetching profile picture:', error);
            avatarUrl = 'https://telegra.ph/file/24fa902ead26340f3df2c.png'; // Avatar default
        }

        // Ambil simp card dari API
        const apiUrl = `https://some-random-api.com/canvas/misc/simpcard?avatar=${encodeURIComponent(avatarUrl)}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        // Buffer gambar
        const imageBuffer = await response.buffer();

        // Kirim gambar dengan caption
        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: '*agamamu: simping* 😏',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421594431163@newsletter',
                    newsletterName: 'Andika Bot',
                    serverMessageId: -1
                }
            }
        });

    } catch (error) {
        console.error('Error in simp command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Maaf, kartu “simp” nggak bisa dibuat sekarang. Coba lagi nanti ya!*',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421594431163@newsletter',
                    newsletterName: 'Andika Bot',
                    serverMessageId: -1
                }
            }
        });
    }
}

module.exports = { simpCommand };
