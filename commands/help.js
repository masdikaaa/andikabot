// commands/help.js
'use strict';

const settings = require('../settings');
const fs = require('fs');
const path = require('path');

/** Format uptime: 1h 2j 3m 4s (h=hari, j=jam, m=menit, s=detik) */
function formatTime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d > 0 ? d + 'h ' : ''}${h > 0 ? h + 'j ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
}

/** Ambil JID pengirim dan string mention (@1234…) */
function getSenderJid(message) {
  return message?.key?.participant || message?.key?.remoteJid || '';
}
function atFromJid(jid) {
  return `@${String(jid).split('@')[0]}`;
}

async function helpCommand(sock, chatId, message) {
  const botName = settings.botName || 'Andika Bot';
  const version = settings.version || '3.0.0';
  const owner = settings.botOwner || 'Andika';

  const senderJid = getSenderJid(message);
  const senderAt = atFromJid(senderJid);
  const mentions = senderJid ? [senderJid] : [];

  // Uptime realtime dari proses
  const uptime = formatTime(process.uptime());

  const helpMessage = [
    '╔════════════════════════════════╗',
    `   🧠 *${botName}*  •  v${version}`,
    `   👋 Halo ${senderAt}!`,
    `   ⏱️  Uptime : *${uptime}*`,
    `   👑 Owner  : *${owner}*`,
    `   📣 Channel: *${global.ytch || '-'}*`,
    '╚════════════════════════════════╝',
    '',
    '📚 *DAFTAR PERINTAH*',
    '',

    // 🌐 UMUM
    '╭─〔 🌐 UMUM 〕',
    '│ • .daftar — daftar bot',
    '│ • .limit — cek kuota',
    '│ • .help / .menu — daftar perintah',
    '│ • .ping — latensi bot',
    '│ • .spek — spesifikasi server bot',
    '│ • .owner — kontak owner',
    '│ • .tts <teks> — text to speech',
    '│ • .joke',
    '│ • .quote',
    '│ • .brat — membuat stiker',
    '│ • .weather <kota>',
    '│ • .infogempa',
    '│ • .news — berita terkini',
    '│ • .attp <teks>',
    '│ • .lyrics <judul_lagu>',
    '│ • .groupinfo',
    '│ • .staff',
    '│ • .vv — view-once viewer',
    '│ • .trt <teks> <kode_bahasa>',
    '│ • .jid — tampilkan JID grup',
    '│ • .google <kueri>',
    '│ • .qr <teks/url>',
    '│ • .job — <nama posisi> <kota>',
    '│ • .text2qr <teks>',
    '│ • .url — ubah media jadi tautan',
    '│ • .getpp @mention — ambil foto profil',
    '│ • .linkgroup — menampilkan link grup dan qr',
    '╰───────────────────────────',
    '',

    // 🛰️ NETWORK DAN WEB
    '╭─〔 🛰️ NETWORK DAN WEB 〕',
    '│ • .domain <domain/url> — info domain',
    '│ • .subdomain <domain> — scaning subdomain',
    '│ • .pingdomain <host/ip> — ping & latensi',
    '│ • .nameserver <domain> — cek NS',
    '│ • .dnscheck <host> — resolve (A/AAAA/MX/TXT)',
    '│ • .ss <url> — screenshot halaman web',
    '│ • .carbon — <kode>',
    '│ • .curl — <url>',
    '│ • .nmap — <example.tld>',
    '╰───────────────────────────',
    '',

    // 🔎 CEK & UTILITAS (baru)
    '╭─〔 🔎 CEK & UTILITAS 〕',
    '│ • .resi <resi> <kurir> — lacak paket',
    '│ • .npm <package> — info versi & dependensi NPM',
    '╰───────────────────────────',
    '',

    // 👮‍♂️ ADMIN
    '╭─〔 👮‍♂️ ADMIN 〕',
    '│ • .ban chat/fitur @user',
    '│ • .unban chat/fitur @user',
    '│ • .promote @user',
    '│ • .demote @user',
    '│ • .mute',
    '│ • .unmute',
    '│ • .delete',
    '│ • .del',
    '│ • .kick @user',
    '│ • .add <nomor>',
    '│ • .warnings',
    '│ • .warnings @user',
    '│ • .warn @user',
    '│ • .antilink',
    '│ • .antibadword',
    '│ • .antitag <on/off>',
    '│ • .welcome <on/off>',
    '│ • .goodbye <on/off>',
    '│ • .resetlink',
    '│ • .tag <pesan>',
    '│ • .tagall',
    '│ • .tagnotadmin',
    '│ • .hidetag <pesan>',
    '│ • .setgdesc <teks>',
    '│ • .setgname <teks>',
    '│ • .setgpp (balas gambar)',
    '│ • .sholat',
    '│ • .remind',
    '│ • .antisticker',
    '╰───────────────────────────',
    '',

    // 🔒 OWNER
    '╭─〔 🔒 OWNER 〕',
    '│ • .mode <public/private>',
    '│ • .reglist',
    '│ • .regdel <no>',
    '│ • .limitadd @user',
    '│ • .limitdel @user',
    '│ • .limitall',
    '│ • .clearsession',
    '│ • .cleartmp',
    '│ • .antidelete',
    '│ • .update',
    '│ • .settings',
    '│ • .setpp (balas gambar)',
    '│ • .autoreact <on/off>',
    '│ • .autostatus <on/off>',
    '│ • .autotyping <on/off>',
    '│ • .autoread <on/off>',
    '│ • .anticall <on/off>',
    '│ • .pmblocker <on/off/status>',
    '│ • .pmblocker setmsg <teks>',
    '│ • .mention',
    '╰───────────────────────────',
    '',

    // 🎨 GAMBAR/STIKER
    '╭─〔 🎨 GAMBAR/STIKER 〕',
    '│ • .sticker (balas gambar)',
    '│ • .simage (balas stiker)',
    '│ • .blur (balas gambar)',
    '│ • .crop (balas gambar)',
    '│ • .removebg',
    '│ • .remini',
    '│ • .tgsticker <tautan>',
    '│ • .meme',
    '│ • .take <packname>',
    '│ • .emojimix <emj1>+<emj2>',
    '│ • .igs <url>',
    '│ • .igsc <url>',
    '╰───────────────────────────',
    '',

    // 🖼️ PIES
    '╭─〔 🖼️ PIES 〕',
    '│ • .pies <negara>',
    '│ • .china',
    '│ • .indonesia',
    '│ • .japan',
    '│ • .korea',
    '│ • .hijab',
    '╰───────────────────────────',
    '',

    // 🎮 GAME
    '╭─〔 🎮 GAME 〕',
    '│ • .tictactoe @user',
    '│ • .hangman',
    '│ • .guess <huruf>',
    '│ • .trivia',
    '│ • .answer <jawaban>',
    '│ • .truth',
    '│ • .dare',
    '╰───────────────────────────',
    '',

    // 🤖 AI
    '╭─〔 🤖 AI 〕',
    '│ • .gpt <tanya>',
    '│ • .gemini <tanya>',
    '│ • .claude <tanya>',
    '│ • .imagine <prompt>',
    '│ • .flux <prompt>',
    '│ • .sora <prompt>',
    '╰───────────────────────────',
    '',

    // 📥 DOWNLOADER (tambahkan .gdrive)
    '╭─〔 📥 DOWNLOADER 〕',
    '│ • .gdrive <url>',
    '│ • .capcut <url>',
    '│ • .play <judul>',
    '│ • .song <judul>',
    '│ • .spotify <kueri>',
    '│ • .instagram <url>',
    '│ • .facebook <url>',
    '│ • .tiktok <url>',
    '│ • .video <judul>',
    '│ • .ytmp4 <url>',
    '╰───────────────────────────',
    '',
    '💡 *Catatan*: *.help* & *.menu* itu *GRATIS* (tidak mengurangi limit).',
    '📢 Follow channel untuk info update terbaru.'
  ].join('\n');

  try {
    const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
    const contextInfo = {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421594431163@newsletter',
        newsletterName: 'Andika Bot',
        serverMessageId: -1
      }
    };

    const basePayload = {
      ...(mentions.length ? { mentions } : {}),
      contextInfo
    };

    if (fs.existsSync(imagePath)) {
      const imageBuffer = fs.readFileSync(imagePath);
      await sock.sendMessage(
        chatId,
        { image: imageBuffer, caption: helpMessage, ...basePayload },
        { quoted: message }
      );
    } else {
      await sock.sendMessage(
        chatId,
        { text: helpMessage, ...basePayload },
        { quoted: message }
      );
    }
  } catch (error) {
    console.error('Error di perintah help:', error);
    await sock.sendMessage(
      chatId,
      { text: helpMessage, ...(mentions.length ? { mentions } : {}) },
      { quoted: message }
    );
  }
}

module.exports = helpCommand;
