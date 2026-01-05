const insults = [
    "Kamu tuh kayak awan—pas hilang, harinya jadi indah! 🌤️",
    "Kamu bikin semua orang senang… pas kamu keluar ruangan. 😌🚪",
    "Aku setuju sama kamu… tapi nanti kita berdua sama-sama salah. 🙃",
    "Kamu bukan bodoh, cuma sial aja kalau lagi mikir. 😅",
    "Rahasiamu aman kok… soalnya aku nggak pernah dengerin. 🤫",
    "Kamu bukti kalau evolusi kadang cuti. 🧬😬",
    "Ada sesuatu di dagumu… eh, yang ketiga ke bawah itu lho. 🙊",
    "Kamu kayak update software—liat kamu bikin mikir, “Perlu nggak sih sekarang?” 🔁📱",
    "Kamu bikin orang bahagia… ya, waktu kamu pergi. 🙂👉",
    "Kamu kayak koin—muka dua dan nilainya kecil. 🪙",
    "Kamu ada yang lagi dipikirin… eh, lupa deh. 🤷",
    "Kamu alasan kenapa botol sampo ada petunjuk cara pakai. 🧴🤦",
    "Kamu kayak awan—melayang tanpa tujuan. ☁️",
    "Jokes kamu kayak susu basi—asem dan susah ditelan. 🥛🤢",
    "Kamu kayak lilin di tengah badai—nggak berguna pas keadaan sulit. 🕯️🌬️",
    "Kamu unik sih… uniknya bisa ngeselin semua orang secara merata. 😑",
    "Kamu kayak sinyal Wi-Fi—lemah pas paling dibutuhin. 📶",
    "Kamu bukti kalau nggak semua orang butuh filter biar nggak enak dilihat. 📵",
    "Energi kamu tuh kayak lubang hitam—nyedot suasana ruangan. 🕳️",
    "Kamu punya muka yang cocok… buat radio. 📻",
    "Kamu kayak macet—nggak ada yang mau, tapi ya ada aja. 🚗🚗",
    "Kamu kayak pensil patah—nggak ada gunanya. ✏️",
    "Idemu orisinal banget… kayak yang sudah pernah kudengar semua. 🔁",
    "Kamu bukti hidup kalau kesalahan juga bisa produktif. 🧪",
    "Kamu bukan malas, cuma termotivasi untuk nggak ngapa-ngapain. 🛌",
    "Otakmu kayak Windows 95—lemot dan jadul. 💾🖥️",
    "Kamu kayak polisi tidur—nggak ada yang suka, tapi semua harus lewat. 🛑",
    "Kamu kayak gerombolan nyamuk—cuma bikin gatel. 🦟",
    "Kamu bikin orang kompak… buat bahas betapa ngeselinnya kamu. 🗣️"
];

async function insultCommand(sock, chatId, message) {
    try {
        if (!message || !chatId) {
            console.log('Invalid message or chatId:', { message, chatId });
            return;
        }

        let userToInsult;
        
        // Cek mention
        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToInsult = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        // Cek reply
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToInsult = message.message.extendedTextMessage.contextInfo.participant;
        }
        
        if (!userToInsult) {
            await sock.sendMessage(chatId, { 
                text: '⚠️ *Harap mention seseorang atau balas pesannya untuk nge-roast dia!*'
            });
            return;
        }

        const insult = insults[Math.floor(Math.random() * insults.length)];

        // Jeda kecil biar aman dari rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.sendMessage(chatId, { 
            text: `💬 @${userToInsult.split('@')[0]}, ${insult}`,
            mentions: [userToInsult]
        });
    } catch (error) {
        console.error('Error in insult command:', error);
        if (error.data === 429) {
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
                    text: '❌ *Terjadi kesalahan saat mengirim roast.*'
                });
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    }
}

module.exports = { insultCommand };
