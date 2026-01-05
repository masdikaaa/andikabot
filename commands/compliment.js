const compliments = [
    "Kamu itu luar biasa apa adanya! ✨",
    "Sense of humor-mu keren banget! 😂",
    "Kamu sangat perhatian dan baik. 😊",
    "Kamu lebih hebat dari yang kamu kira. 💪",
    "Kehadiranmu bikin suasana jadi cerah! 🌟",
    "Kamu teman sejati. 🤝",
    "Kamu menginspirasi! 🔥",
    "Kreativitasmu gak ada batasnya! 🎨",
    "Hatimu emas. 🫶",
    "Kamu membawa dampak baik untuk sekitar. 🌍",
    "Positifmu menular! 😄",
    "Etos kerjamu patut dicontoh. 🧠",
    "Kamu bikin orang lain jadi versi terbaiknya. 🌱",
    "Senyumanmu bikin hari orang lain cerah. 😊",
    "Kamu berbakat di banyak hal. ⭐",
    "Kebaikanmu bikin dunia lebih baik. ❤️",
    "Sudut pandangmu unik dan berharga. 🔭",
    "Antusiasmemu sangat menginspirasi! 🚀",
    "Kamu mampu meraih hal-hal besar. 🏆",
    "Kamu selalu bisa bikin orang merasa spesial. 🎁",
    "Percaya dirimu mengagumkan. 😎",
    "Jiwamu indah. ✨",
    "Kedermawananmu tak berbatas. 🎁",
    "Matamu jeli terhadap detail. 🔎",
    "Passion-mu memotivasi! ⚡",
    "Kamu pendengar yang hebat. 👂",
    "Kamu lebih kuat dari yang kamu bayangkan! 🛡️",
    "Tawamu menular. 😂",
    "Kamu punya bakat membuat orang merasa dihargai. 💬",
    "Dunia jadi lebih baik karena ada kamu. 🌈"
];

async function complimentCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) {
            console.log('Invalid message or chatId:', { message, chatId });
            return;
        }

        let userToCompliment;
        
        // Cek mention
        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        // Cek reply
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToCompliment = message.message.extendedTextMessage.contextInfo.participant;
        }
        
        if (!userToCompliment) {
            await sock.sendMessage(chatId, { 
                text: '⚠️ *Harap mention seseorang atau balas pesannya untuk memberi pujian!*'
            });
            return;
        }

        const compliment = compliments[Math.floor(Math.random() * compliments.length)];

        // Tambahkan jeda kecil agar aman dari rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.sendMessage(chatId, { 
            text: `💬 @${userToCompliment.split('@')[0]}, ${compliment}`,
            mentions: [userToCompliment]
        });
    } catch (error) {
        console.error('Error in compliment command:', error);
        if (error.data === 429) {
            // Rate limited
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                await sock.sendMessage(chatId, { 
                    text: '⏳ *Terlalu cepat.* Coba lagi beberapa detik lagi ya.'
                });
            } catch (retryError) {
                console.error('Error sending retry message:', retryError);
            }
        } else {
            try {
                await sock.sendMessage(chatId, { 
                    text: '❌ *Terjadi kesalahan saat mengirim pujian.*'
                });
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    }
}

module.exports = { complimentCommand };
