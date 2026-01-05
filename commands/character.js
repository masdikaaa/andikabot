const axios = require('axios');
const { channelInfo } = require('../lib/messageConfig');

async function characterCommand(sock, chatId, message) {
    let userToAnalyze;
    
    // Cek mention
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        userToAnalyze = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    // Cek reply
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        userToAnalyze = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToAnalyze) {
        await sock.sendMessage(chatId, { 
            text: '⚠️ *Harap mention seseorang atau balas pesannya untuk dianalisis!*',
            ...channelInfo 
        });
        return;
    }

    try {
        // Ambil foto profil user
        let profilePic;
        try {
            profilePic = await sock.profilePictureUrl(userToAnalyze, 'image');
        } catch {
            profilePic = 'https://i.imgur.com/2wzGhpF.jpeg'; // default kalau tidak ada foto profil
        }

        // Daftar sifat (Bahasa Indonesia)
        const traits = [
            "Cerdas", "Kreatif", "Gigih", "Ambisius", "Peduli",
            "Karismatik", "Percaya Diri", "Empatik", "Enerjik", "Ramah",
            "Dermawan", "Jujur", "Humoris", "Imajinatif", "Mandiri",
            "Intuitif", "Baik Hati", "Logis", "Loyal", "Optimistis",
            "Bersemangat", "Sabar", "Tekun", "Dapat Diandalkan", "Cepat Akal",
            "Tulus", "Peka", "Pengertian", "Serba Bisa", "Bijak"
        ];

        // Ambil 3–5 sifat acak
        const numTraits = Math.floor(Math.random() * 3) + 3; // 3 sampai 5
        const selectedTraits = [];
        for (let i = 0; i < numTraits; i++) {
            const randomTrait = traits[Math.floor(Math.random() * traits.length)];
            if (!selectedTraits.includes(randomTrait)) {
                selectedTraits.push(randomTrait);
            }
        }

        // Persentase acak untuk tiap sifat (60–100%)
        const traitPercentages = selectedTraits.map(trait => {
            const percentage = Math.floor(Math.random() * 41) + 60;
            return `- ${trait}: ${percentage}%`;
        });

        // Susun pesan analisis
        const analysis = `🔮 *Analisis Karakter* 🔮\n\n` +
            `👤 *User:* @${userToAnalyze.split('@')[0]}\n\n` +
            `✨ *Sifat Utama:*\n${traitPercentages.join('\n')}\n\n` +
            `🎯 *Skor Keseluruhan:* ${Math.floor(Math.random() * 21) + 80}%\n\n` +
            `ℹ️ *Catatan:* Ini hanya hiburan, jangan dianggap terlalu serius ya!`;

        // Kirim bareng foto profil
        await sock.sendMessage(chatId, {
            image: { url: profilePic },
            caption: analysis,
            mentions: [userToAnalyze],
            ...channelInfo
        });

    } catch (error) {
        console.error('Error in character command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Gagal menganalisis karakter! Coba lagi nanti.*',
            ...channelInfo 
        });
    }
}

module.exports = characterCommand;
