// commands/settings.js
const fs = require('fs');
const settings = require('../settings');
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');
const { channelInfo } = require('../lib/messageConfig');

// import store dari mention.js
const { _mentionStore } = require('./mention'); // <- penting

function readJsonSafe(path, fallback) {
  try {
    const txt = fs.readFileSync(path, 'utf8');
    return JSON.parse(txt);
  } catch (_) {
    return fallback;
  }
}

function onOff(v) { return v ? '🟢 ON' : '🔴 OFF'; }
function pubPriv(v) { return v ? '🌐 Public' : '🔒 Private'; }

async function settingsCommand(sock, chatId, message) {
  try {
    const dataDir = './data';
    const senderId = message.key.participant || message.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    // --- Perizinan: owner / sudo / admin / owner grup
    const isOwnerBot = !!message.key.fromMe;
    let isSudoUser = false, senderIsAdmin = false, senderIsGroupOwner = false;

    try { isSudoUser = await isSudo(senderId); } catch {}

    if (isGroup) {
      try {
        const meta = await sock.groupMetadata(chatId);
        const { isSenderAdmin } = await isAdmin(sock, chatId, senderId, message);
        senderIsAdmin = !!isSenderAdmin;
        senderIsGroupOwner = !!meta.owner && meta.owner === senderId;
      } catch {}
    }

    const allow = isOwnerBot || isSudoUser || senderIsAdmin || senderIsGroupOwner;
    if (!allow) {
      await sock.sendMessage(
        chatId,
        { text: '⛔ *Hanya owner/sudo/admin/owner grup yang bisa memakai perintah ini!*', ...channelInfo },
        { quoted: message }
      );
      return;
    }

    // --- Baca konfigurasi lain
    const mode       = readJsonSafe(`${dataDir}/messageCount.json`, { isPublic: true });
    const autoStatus = readJsonSafe(`${dataDir}/autoStatus.json`,   { enabled: false });
    const autoread   = readJsonSafe(`${dataDir}/autoread.json`,     { enabled: false });
    const autotyping = readJsonSafe(`${dataDir}/autotyping.json`,   { enabled: false });
    const pmblocker  = readJsonSafe(`${dataDir}/pmblocker.json`,    { enabled: false });
    const anticall   = readJsonSafe(`${dataDir}/anticall.json`,     { enabled: false });
    const userGroupData = readJsonSafe(`${dataDir}/userGroupData.json`, {
      antilink: {}, antibadword: {}, welcome: {}, goodbye: {}, chatbot: {}, antitag: {}, autoReaction: false
    });
    const autoReaction = Boolean(userGroupData.autoReaction);

    // --- Status Mention (GLOBAL & PER-CHAT)
    const mentionStore       = _mentionStore.readStore();
    const mentionGlobalOn    = !!mentionStore.globalEnabled;
    const mentionChatOn      = _mentionStore.isMentionEnabledFor(chatId);
    const mentionSudoOnlyOn  = _mentionStore.isSudoOnly(chatId);

    // Fitur per grup
    const groupId = isGroup ? chatId : null;
    const antilinkOn    = groupId ? !!(userGroupData.antilink && userGroupData.antilink[groupId]) : false;
    const antibadwordOn = groupId ? !!(userGroupData.antibadword && userGroupData.antibadword[groupId]) : false;
    const welcomeOn     = groupId ? !!(userGroupData.welcome && userGroupData.welcome[groupId]) : false;
    const goodbyeOn     = groupId ? !!(userGroupData.goodbye && userGroupData.goodbye[groupId]) : false;
    const chatbotOn     = groupId ? !!(userGroupData.chatbot && userGroupData.chatbot[groupId]) : false;
    const antitagCfg    = groupId ? (userGroupData.antitag && userGroupData.antitag[groupId]) : null;

    // Ambil nama grup (kalau bisa)
    let groupName = '';
    if (groupId) {
      try {
        const meta = await sock.groupMetadata(chatId);
        groupName = meta?.subject ? ` (${meta.subject})` : '';
      } catch {}
    }

    // --- Tampilan rapi
    const head = [
      '╭─〔 ⚙️ *PENGATURAN BOT* 〕',
      `│ 🤖 ${settings.botName || 'Andika Bot'}  •  v${settings.version || '3.0.0'}`,
      `│ 🧭 Mode        : ${pubPriv(mode.isPublic)}`,
      `│ 📣 AutoStatus  : ${onOff(autoStatus.enabled)}`,
      `│ 📖 Autoread    : ${onOff(autoread.enabled)}`,
      `│ ⌨️ Autotyping  : ${onOff(autotyping.enabled)}`,
      `│ 🔐 PMBlocker   : ${onOff(pmblocker.enabled)}`,
      `│ ☎️ Anticall    : ${onOff(anticall.enabled)}`,
      `│ ✨ AutoReact   : ${onOff(autoReaction)}`,
      '│',
      `│ 🏷️ Mention (Global) : ${onOff(mentionGlobalOn)}`,
      `│ 🏷️ Mention (Chat)   : ${onOff(mentionChatOn)}`,
      `│ 🛡️ Mention Sudo-Only: ${mentionSudoOnlyOn ? '🔒 ON' : '🔓 OFF'}`
    ];

    const groupBlock = groupId ? [
      '│',
      `│ 👥 *Grup:* ${groupId}${groupName}`,
      `│ 🔗 Antilink    : ${antilinkOn ? `🟢 ON (aksi: ${userGroupData.antilink[groupId].action || 'delete'})` : '🔴 OFF'}`,
      `│ 🚫 Badword     : ${antibadwordOn ? `🟢 ON (aksi: ${userGroupData.antibadword[groupId].action || 'delete'})` : '🔴 OFF'}`,
      `│ 👋 Welcome     : ${welcomeOn ? '🟢 ON' : '🔴 OFF'}`,
      `│ 👋 Goodbye     : ${goodbyeOn ? '🟢 ON' : '🔴 OFF'}`,
      `│ 🤖 Chatbot     : ${chatbotOn ? '🟢 ON' : '🔴 OFF'}`,
      `│ 🔔 Antitag     : ${(antitagCfg && antitagCfg.enabled) ? `🟢 ON (aksi: ${antitagCfg.action || 'delete'})` : '🔴 OFF'}`
    ] : [
      '│',
      '│ ℹ️ *Catatan:* Pengaturan per-grup muncul bila dipakai di dalam grup.'
    ];

    const foot = [
      '╰──────────────────────────────',
      '✨ *Andika Bot*'
    ];

    const text = [...head, ...groupBlock, ...foot].join('\n');

    await sock.sendMessage(
      chatId,
      { text, ...channelInfo },
      { quoted: message }
    );

  } catch (error) {
    console.error('Error in settings command:', error);
    await sock.sendMessage(chatId, { text: '❌ *Gagal membaca pengaturan.*' }, { quoted: message });
  }
}

module.exports = settingsCommand;
