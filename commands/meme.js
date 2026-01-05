const fetch = require('node-fetch');

async function memeCommand(sock, chatId, message) {
    try {
        const response = await fetch('https://shizoapi.onrender.com/api/memes/cheems?apikey=shizo');
        
        // Cek apakah respons berupa gambar
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
            const imageBuffer = await response.buffer();
            
            const buttons = [
                { buttonId: '.meme', buttonText: { displayText: '🎭 Meme Lagi' }, type: 1 },
                { buttonId: '.joke', buttonText: { displayText: '😄 Lelucon' }, type: 1 }
            ];

            await sock.sendMessage(chatId, { 
                image: imageBuffer,
                caption: "> Nih meme cheems kamu! 🐕",
                buttons: buttons,
                headerType: 1
            }, { quoted: message });
        } else {
            throw new Error('Invalid response type from API');
        }
    } catch (error) {
        console.error('Error in meme command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Gagal mengambil meme. Coba lagi nanti ya!*'
        }, { quoted: message });
    }
}

module.exports = memeCommand;
