const axios = require('axios');

module.exports = async function (sock, chatId, message) {
    try {
        const response = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
        const fact = response.data.text;

        await sock.sendMessage(
            chatId, 
            { text: `🧠 *Fakta Acak:*\n${fact}` },
            { quoted: message }
        );
    } catch (error) {
        console.error('Error fetching fact:', error);
        await sock.sendMessage(
            chatId, 
            { text: '❌ *Maaf, aku tidak bisa mengambil fakta sekarang.*' },
            { quoted: message }
        );
    }
};
