// commands/docker.js — self-restart container via WA
// Fitur: .docker restart andikabot
// - HANYA admin grup / owner / sudo
// - Container bot pakai `restart: always` → Docker yang revive

'use strict';

const { channelInfo } = require('../lib/messageConfig');
const isAdmin         = require('../lib/isAdmin');
const { isSudo }      = require('../lib/index');

const BRAND = 'Andika Bot';
const ICON  = { ok:'✅', warn:'⚠️', err:'❌' };

const CONTAINER_ALIAS = 'andikabot'; // nama yang diijinkan di command

const head = (title) =>
`╭─〔 ${title} 〕
│ ${BRAND}
╰──────────────────`;

async function safeIsSudo(jid) {
  try { return await isSudo(jid); }
  catch { return false; }
}

/**
 * .docker command
 * @param {any} sock
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {string} prefix
 * @param {string[]} args
 */
async function dockerCommand(sock, m, prefix, args = []) {
  const chatId = m.key.remoteJid;
  const sender = m.key.participant || m.key.remoteJid;

  const reply = (text) =>
    sock.sendMessage(
      chatId,
      { text, ...(channelInfo || {}) },
      { quoted: m }
    );

  const isGroup  = chatId.endsWith('@g.us');
  let adminInfo  = { isSenderAdmin:false };
  const sudo     = await safeIsSudo(sender);
  const isOwner  = !!m.key.fromMe;

  if (isGroup) {
    try {
      adminInfo = await isAdmin(sock, chatId, sender, m);
    } catch {}

    if (!adminInfo.isSenderAdmin && !sudo && !isOwner) {
      await reply('🚫 Perintah *.docker* hanya untuk *admin grup*, *owner*, atau *sudo*.');
      return;
    }
  } else {
    // chat pribadi → hanya owner/sudo
    if (!sudo && !isOwner) {
      await reply('🚫 Perintah *.docker* di chat pribadi hanya boleh untuk *owner/sudo*.');
      return;
    }
  }

  const sub    = (args[0] || '').toLowerCase();
  const target = (args[1] || '').toLowerCase();

  if (!sub || sub !== 'restart' || !target) {
    const txt =
      `${head('Docker Control')}\n` +
      `Perintah tersedia:\n` +
      `• ${prefix}docker restart ${CONTAINER_ALIAS}\n` +
      `   → Bot mematikan dirinya sendiri, Docker akan auto-restart container.\n`;
    await reply(txt);
    return;
  }

  if (target !== CONTAINER_ALIAS.toLowerCase()) {
    await reply(
      `${head('Docker Control')}\n` +
      `❌ Demi keamanan, hanya boleh restart container *${CONTAINER_ALIAS}*.\n`
    );
    return;
  }

  await reply(
    `${head('Docker Restart')}\n` +
    `${ICON.warn} Sedang melakukan *self-restart* container *${CONTAINER_ALIAS}* …\n\n` +
    `• Proses Node.js akan keluar secara paksa\n` +
    `• Karena \`restart: always\` di docker-compose, Docker akan otomatis menyalakan bot lagi.\n\n` +
    `Bot akan offline sebentar, lalu nyala lagi kalau Docker OK.`
  );

  setTimeout(() => {
    try {
      console.log('[DOCKER] self-restart triggered via .docker restart command');
    } finally {
      process.exit(86); // bebas, yg penting non-0 biar keliatan di logs
    }
  }, 1500);
}

module.exports = {
  dockerCommand
};
