const axios = require('axios');
const settings = require('../settings'); // API key disimpan di sini

async function gifCommand(sock, chatId, query) {
    const apiKey = settings.giphyApiKey; // Giphy API Key kamu

    if (!query) {
        await sock.sendMessage(chatId, { text: '⚠️ *Harap masukkan kata kunci untuk GIF.*\n📌 Contoh: *.gif kucing lucu*' });
        return;
    }

    try {
        const response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
            params: {
                api_key: apiKey,
                q: query,
                limit: 1,
                rating: 'g'
            }
        });

        const gifUrl = response.data.data[0]?.images?.downsized_medium?.url;

        if (gifUrl) {
            await sock.sendMessage(
                chatId, 
                { video: { url: gifUrl }, caption: `🎬 *GIF untuk:* "${query}"` }
            );
        } else {
            await sock.sendMessage(
                chatId, 
                { text: `❌ *GIF tidak ditemukan untuk:* "${query}"` }
            );
        }
    } catch (error) {
        console.error('Error fetching GIF:', error);
        await sock.sendMessage(
            chatId, 
            { text: '❌ *Gagal mengambil GIF. Coba lagi nanti ya!*' }
        );
    }
}

module.exports = gifCommand;
