const fetch = require('node-fetch');

async function goodnightCommand(sock, chatId, message) {
    try {
        const shizokeys = 'shizo';
        const res = await fetch(`https://shizoapi.onrender.com/api/texts/lovenight?apikey=${shizokeys}`);
        
        if (!res.ok) {
            throw await res.text();
        }
        
        const json = await res.json();
        const goodnightMessage = json.result;

        // Kirim pesan selamat malam
        await sock.sendMessage(
            chatId, 
            { text: `🌙 *Selamat Malam:*\n${goodnightMessage}` }, 
            { quoted: message }
        );
    } catch (error) {
        console.error('Error in goodnight command:', error);
        await sock.sendMessage(
            chatId, 
            { text: '❌ *Gagal mengambil pesan selamat malam. Coba lagi nanti ya!*' }, 
            { quoted: message }
        );
    }
}

module.exports = { goodnightCommand };
