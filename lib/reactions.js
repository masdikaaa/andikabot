const fs = require('fs');
const path = require('path');

// ====== KONFIG: Emoji jam statis ======
const COMMAND_EMOJI = '⏰'; // ganti ke '🕒' / '⌚️' / '⏳' jika mau

// ====== PATH ======
const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');
const MAIN_JS_PATH = path.join(__dirname, '..', 'main.js');

// ====== STATE ======
let isAutoReactionEnabled = loadAutoReactionState();
let allowedCommands = new Set();

// Muat daftar command dari main.js saat startup
refreshAllowedCommands();

// Hot-reload saat main.js berubah (tanpa restart bot)
try {
  fs.watch(MAIN_JS_PATH, { persistent: false }, () => {
    setTimeout(() => {
      try { refreshAllowedCommands(); } catch {}
    }, 200);
  });
} catch (_) { /* abaikan jika platform tidak support watch */ }

// ====== Helpers ======
function loadAutoReactionState() {
  try {
    if (fs.existsSync(USER_GROUP_DATA)) {
      const data = JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
      return !!data.autoReaction;
    }
  } catch (e) {
    console.error('Error loading auto-reaction state:', e.message);
  }
  return false;
}

function saveAutoReactionState(state) {
  try {
    const data = fs.existsSync(USER_GROUP_DATA)
      ? JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'))
      : { antibadword: {}, antilink: {}, welcome: {}, goodbye: {}, chatbot: {}, warnings: {}, sudo: [] };

    data.autoReaction = !!state;
    fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving auto-reaction state:', e.message);
  }
}

function extractText(msg) {
  try {
    return (
      msg?.message?.conversation?.trim() ||
      msg?.message?.extendedTextMessage?.text?.trim() ||
      msg?.message?.imageMessage?.caption?.trim() ||
      msg?.message?.videoMessage?.caption?.trim() ||
      ''
    );
  } catch {
    return '';
  }
}

function extractCommandToken(raw) {
  const t = (raw || '').trim();
  if (!t.startsWith('.')) return '';
  return t.split(/\s+/)[0].toLowerCase();
}

/**
 * Parse main.js untuk mengambil semua token command yang valid.
 * Menangkap pola:
 *   userMessage === '.xxx'
 *   userMessage.startsWith('.xxx')
 *   (userMessage === '.xxx') dalam gabungan kondisi
 */
function refreshAllowedCommands() {
  try {
    const src = fs.readFileSync(MAIN_JS_PATH, 'utf8');

    const set = new Set();

    // Pola equality: userMessage === '.help'  atau  (userMessage === ".ig")
    const eqRegex = /userMessage\s*===\s*['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = eqRegex.exec(src)) !== null) {
      set.add(m[1].toLowerCase());
    }

    // Pola startsWith: userMessage.startsWith('.help')
    const swRegex = /userMessage\s*\.startsWith\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    while ((m = swRegex.exec(src)) !== null) {
      set.add(m[1].toLowerCase());
    }

    // Tambahan: kadang ada case userMessage === '.alive' tanpa spasi standar, sudah tercakup oleh eqRegex.

    // Simpan
    allowedCommands = set;

    // Optional debug:
    // console.log('[autoreact] Parsed commands:', [...allowedCommands]);
  } catch (e) {
    console.error('Gagal parse commands dari main.js:', e.message);
    // Jika gagal parse, biarkan allowedCommands sebelumnya (fail-safe)
  }
}

// ====== API utama ======
async function addCommandReaction(sock, message) {
  try {
    if (!isAutoReactionEnabled || !message?.key?.id) return;

    const raw = extractText(message);
    const token = extractCommandToken(raw);
    if (!token) return; // bukan command
    if (!allowedCommands.has(token)) return; // command tidak ada di main.js -> jangan react

    await sock.sendMessage(message.key.remoteJid, {
      react: { text: COMMAND_EMOJI, key: message.key }
    });
  } catch (e) {
    console.error('Error adding command reaction:', e.message);
  }
}

async function handleAreactCommand(sock, chatId, message, isOwnerOrSudo) {
  try {
    if (!isOwnerOrSudo) {
      await sock.sendMessage(chatId, {
        text: '❌ Perintah ini khusus *Owner/Sudo*!'
      }, { quoted: message });
      return;
    }

    const raw = extractText(message);
    const parts = raw.trim().split(/\s+/);
    const action = (parts[1] || '').toLowerCase();

    if (action === 'on') {
      isAutoReactionEnabled = true;
      saveAutoReactionState(true);
      await sock.sendMessage(chatId, {
        text: `✅ *Auto-reaction* diaktifkan (global). Emoji: ${COMMAND_EMOJI}`
      }, { quoted: message });
      return;
    }

    if (action === 'off') {
      isAutoReactionEnabled = false;
      saveAutoReactionState(false);
      await sock.sendMessage(chatId, {
        text: '✅ *Auto-reaction* dimatikan (global).'
      }, { quoted: message });
      return;
    }

    const state = isAutoReactionEnabled ? 'aktif' : 'nonaktif';
    await sock.sendMessage(chatId, {
      text:
`ℹ️ Status *auto-reaction*: *${state}* (global)

Gunakan:
• .areact on  → aktifkan
• .areact off → matikan

Catatan:
• Bot hanya bereaksi pada *command* yang terdeteksi otomatis dari *main.js* (tanpa whitelist manual).
• Emoji yang dipakai saat ini: ${COMMAND_EMOJI}`
    }, { quoted: message });
  } catch (e) {
    console.error('Error handling areact command:', e.message);
    await sock.sendMessage(chatId, {
      text: '❌ Terjadi kesalahan saat mengatur *auto-reaction*.'
    }, { quoted: message });
  }
}

module.exports = {
  addCommandReaction,
  handleAreactCommand
};
