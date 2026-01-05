const moment = require('moment-timezone');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function githubCommand(sock, chatId, message) {
  try {
    const res = await fetch('https://api.github.com/repos/mruniquehacker/Knightbot-md');
    if (!res.ok) throw new Error('Error fetching repository data');
    const json = await res.json();

    const updatedWIB = moment(json.updated_at).tz('Asia/Jakarta').format('DD/MM/YY - HH:mm:ss [WIB]');

    let txt = `*乂  ℹ️ Info Repo Andika Bot 乂*\n\n`;
    txt += `📛 *Nama*       : ${json.name}\n`;
    txt += `👀 *Watcher*    : ${json.watchers_count}\n`;
    txt += `📦 *Ukuran*     : ${(json.size / 1024).toFixed(2)} MB\n`;
    txt += `⏱️ *Diperbarui* : ${updatedWIB}\n`;
    txt += `🔗 *URL*        : ${json.html_url}\n`;
    txt += `🍴 *Forks*      : ${json.forks_count}\n`;
    txt += `⭐ *Stars*      : ${json.stargazers_count}\n\n`;
    txt += `💥 *Andika Bot*`;

    // Gambar lokal
    const imgPath = path.join(__dirname, '../assets/bot_image.jpg');
    const imgBuffer = fs.readFileSync(imgPath);

    await sock.sendMessage(chatId, { image: imgBuffer, caption: txt }, { quoted: message });
  } catch (error) {
    await sock.sendMessage(chatId, { text: '❌ *Gagal mengambil informasi repository.*' }, { quoted: message });
  }
}

module.exports = githubCommand;
