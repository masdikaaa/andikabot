const os = require('os');
const settings = require('../settings.js');
const { channelInfo } = require('../lib/messageConfig'); // tinggal import channelInfo

function formatTime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? d + "h " : ""}${h > 0 ? h + "j " : ""}${m > 0 ? m + "m " : ""}${s}s`;
}

async function pingCommand(sock, chatId, message) {
    try {
        // Hitung latency
        const start = Date.now();
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        const end = Date.now();
        const ping = Math.round(end - start);

        // Uptime bot
        const uptimeInSeconds = process.uptime();
        const uptimeFormatted = formatTime(uptimeInSeconds);

        // Info sistem
        const cpuModel = os.cpus()[0].model;
        const cpuCores = os.cpus().length;
        const cpuSpeed = os.cpus()[0].speed; // MHz
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const platform = os.platform();
        const arch = os.arch();

        // Pesan status bot
        const botInfo = `
┏━━〔 🤖 *Andika Bot Status* 〕━━┓
┃ ⚡ *Ping*        : ${ping} ms
┃ ⏱️ *Aktif Sejak* : ${uptimeFormatted}
┃ 🔖 *Versi Bot*   : v${settings.version}
┃ 🖥️ *OS*          : ${platform} (${arch})
┃ 🔩 *CPU*         : ${cpuModel} (${cpuCores} core @ ${cpuSpeed}MHz)
┃ 💾 *Memory*      : ${usedMem}GB / ${totalMem}GB
┗━━━━━━━━━━━━━━━━━━━━━━━┛
`.trim();

        // Kirim ke user + otomatis ada View channel dari ...channelInfo
        await sock.sendMessage(chatId, {
            text: botInfo,
            ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('❌ Error in ping command:', error);
        await sock.sendMessage(chatId, { text: '❌ *Gagal mengambil status bot.*' }, { quoted: message });
    }
}

module.exports = pingCommand;
