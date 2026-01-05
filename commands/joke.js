const axios = require('axios');

module.exports = async function (sock, chatId) {
    try {
        const response = await axios.get('https://icanhazdadjoke.com/', {
            headers: { Accept: 'application/json' }
        });
        const joke = response.data.joke;
        await sock.sendMessage(chatId, { text: `😂 *Dad Joke:*\n${joke}` });
    } catch (error) {
        console.error('Error fetching joke:', error);
        await sock.sendMessage(chatId, { text: '❌ *Maaf, aku belum bisa ambil lelucon sekarang.*' });
    }
};
