const axios = require('axios');
const { sleep } = require('../lib/myfunc');

async function pairCommand(sock, chatId, message, q) {
    try {
        if (!q) {
            return await sock.sendMessage(chatId, {
                text: "⚠️ *Harap berikan nomor WhatsApp yang valid*\n📌 *Contoh:* `.pair 62812345XXXX`",
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

        const numbers = q.split(',')
            .map((v) => v.replace(/[^0-9]/g, ''))
            .filter((v) => v.length > 5 && v.length < 20);

        if (numbers.length === 0) {
            return await sock.sendMessage(chatId, {
                text: "❌ *Nomor tidak valid.* Gunakan format yang benar!",
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

        for (const number of numbers) {
            const whatsappID = number + '@s.whatsapp.net';
            const result = await sock.onWhatsApp(whatsappID);

            if (!result[0]?.exists) {
                return await sock.sendMessage(chatId, {
                    text: "❗️ *Nomor tersebut tidak terdaftar di WhatsApp.*",
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

            await sock.sendMessage(chatId, {
                text: "⏳ *Tunggu sebentar, sedang mengambil kode…*",
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

            try {
                const response = await axios.get(`https://knight-bot-paircode.onrender.com/code?number=${number}`);
                
                if (response.data && response.data.code) {
                    const code = response.data.code;
                    if (code === "Service Unavailable") {
                        throw new Error('Service Unavailable');
                    }
                    
                    await sleep(5000);
                    await sock.sendMessage(chatId, {
                        text: `🔐 *Kode pairing kamu:* ${code}`,
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
                } else {
                    throw new Error('Invalid response from server');
                }
            } catch (apiError) {
                console.error('API Error:', apiError);
                const errorMessage = apiError.message === 'Service Unavailable' 
                    ? "🚧 *Layanan sedang tidak tersedia. Coba lagi nanti ya.*"
                    : "❌ *Gagal membuat kode pairing. Coba lagi nanti ya.*";
                
                await sock.sendMessage(chatId, {
                    text: errorMessage,
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
    } catch (error) {
        console.error(error);
        await sock.sendMessage(chatId, {
            text: "❌ *Terjadi kesalahan. Coba lagi nanti ya.*",
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

module.exports = pairCommand;
