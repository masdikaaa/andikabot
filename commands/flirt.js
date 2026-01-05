const fetch = require('node-fetch');

async function flirtCommand(sock, chatId, message) {
    try {
        const shizokeys = 'shizo';
        const res = await fetch(`https://shizoapi.onrender.com/api/texts/flirt?apikey=${shizokeys}`);
        
        if (!res.ok) {
            throw await res.text();
        }
        
        const json = await res.json();
        const flirtMessage = json.result;

        // Kirim pesan gombal
        await sock.sendMessage(
            chatId, 
            { text: `💘 *Gombalan:*\n${flirtMessage}` }, 
            { quoted: message }
        );
    } catch (error) {
        console.error('Error in flirt command:', error);
        await sock.sendMessage(
            chatId, 
            { text: '❌ *Gagal mengambil gombalan. Coba lagi nanti ya!*' }, 
            { quoted: message }
        );
    }
}

module.exports = { flirtCommand };
