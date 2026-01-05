/**
 * Knight Bot - A WhatsApp Bot
 * Autotyping Command - Shows fake typing status
 */

const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

// Path to store the configuration
const configPath = path.join(__dirname, '..', 'data', 'autotyping.json');

// Initialize configuration file if it doesn't exist
function initConfig() {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
  }
  return JSON.parse(fs.readFileSync(configPath));
}

// Toggle autotyping feature
async function autotypingCommand(sock, chatId, message) {
  try {
    const senderId = message.key.participant || message.key.remoteJid;

    // --- Perizinan: owner bot / sudo / admin grup / owner grup ---
    let allow = false;
    const isOwnerBot = !!message.key.fromMe;
    let isSudoUser = false;
    let senderIsAdmin = false;
    let senderIsGroupOwner = false;

    try { isSudoUser = await isSudo(senderId); } catch {}

    if (chatId.endsWith('@g.us')) {
      try {
        const meta = await sock.groupMetadata(chatId);
        const adm = await isAdmin(sock, chatId, senderId, message);
        senderIsAdmin = !!adm.isSenderAdmin;
        senderIsGroupOwner = !!meta.owner && meta.owner === senderId;
      } catch {}
    }

    allow = isOwnerBot || isSudoUser || senderIsAdmin || senderIsGroupOwner;

    if (!allow) {
      await sock.sendMessage(chatId, {
        text: '⛔ *Hanya owner/sudo/admin/owner grup yang bisa memakai perintah ini!*',
      }, { quoted: message });
      return;
    }

    // Get command arguments
    const textA = message.message?.conversation?.trim()
      || message.message?.extendedTextMessage?.text?.trim()
      || '';
    const args = textA.split(' ').slice(1);

    // Initialize or read config
    const config = initConfig();

    // Toggle based on argument or toggle current state if no argument
    if (args.length > 0) {
      const action = (args[0] || '').toLowerCase();
      if (action === 'on' || action === 'enable') {
        config.enabled = true;
      } else if (action === 'off' || action === 'disable') {
        config.enabled = false;
      } else {
        await sock.sendMessage(chatId, {
          text: '❌ Opsi tidak valid!\nGunakan: *.autotyping on* / *.autotyping off*'
        }, { quoted: message });
        return;
      }
    } else {
      // Toggle current state
      config.enabled = !config.enabled;
    }

    // Save updated configuration
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Send confirmation message
    await sock.sendMessage(chatId, {
      text: `✅ Auto-typing ${config.enabled ? 'diaktifkan' : 'dimatikan'}!`
    }, { quoted: message });

  } catch (error) {
    console.error('Error in autotyping command:', error);
    await sock.sendMessage(chatId, {
      text: '❌ Error memproses perintah!'
    }, { quoted: message });
  }
}

// Function to check if autotyping is enabled
function isAutotypingEnabled() {
  try {
    const config = initConfig();
    return config.enabled;
  } catch (error) {
    console.error('Error checking autotyping status:', error);
    return false;
  }
}

// Function to handle autotyping for regular messages
async function handleAutotypingForMessage(sock, chatId, userMessage) {
  if (isAutotypingEnabled()) {
    try {
      await sock.presenceSubscribe(chatId);
      await sock.sendPresenceUpdate('available', chatId);
      await new Promise(r => setTimeout(r, 500));
      await sock.sendPresenceUpdate('composing', chatId);
      const typingDelay = Math.max(3000, Math.min(8000, userMessage.length * 150));
      await new Promise(r => setTimeout(r, typingDelay));
      await sock.sendPresenceUpdate('composing', chatId);
      await new Promise(r => setTimeout(r, 1500));
      await sock.sendPresenceUpdate('paused', chatId);
      return true;
    } catch (error) {
      console.error('❌ Error sending typing indicator:', error);
      return false;
    }
  }
  return false;
}

// Function to handle autotyping for commands - BEFORE command execution (not used anymore)
async function handleAutotypingForCommand(sock, chatId) {
  if (isAutotypingEnabled()) {
    try {
      await sock.presenceSubscribe(chatId);
      await sock.sendPresenceUpdate('available', chatId);
      await new Promise(r => setTimeout(r, 500));
      await sock.sendPresenceUpdate('composing', chatId);
      await new Promise(r => setTimeout(r, 3000));
      await sock.sendPresenceUpdate('composing', chatId);
      await new Promise(r => setTimeout(r, 1500));
      await sock.sendPresenceUpdate('paused', chatId);
      return true;
    } catch (error) {
      console.error('❌ Error sending command typing indicator:', error);
      return false;
    }
  }
  return false;
}

// Function to show typing status AFTER command execution
async function showTypingAfterCommand(sock, chatId) {
  if (isAutotypingEnabled()) {
    try {
      await sock.presenceSubscribe(chatId);
      await sock.sendPresenceUpdate('composing', chatId);
      await new Promise(r => setTimeout(r, 1000));
      await sock.sendPresenceUpdate('paused', chatId);
      return true;
    } catch (error) {
      console.error('❌ Error sending post-command typing indicator:', error);
      return false;
    }
  }
  return false;
}

module.exports = {
  autotypingCommand,
  isAutotypingEnabled,
  handleAutotypingForMessage,
  handleAutotypingForCommand,
  showTypingAfterCommand
};
