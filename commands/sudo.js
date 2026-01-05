// commands/sudo.js
const settings = require('../settings');
const { addSudo, removeSudo, getSudoList } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const { channelInfo } = require('../lib/messageConfig');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// --- Helpers ---
function onlyDigits(str = '') {
  const m = String(str).match(/(\d{7,20})/);
  return m ? m[1] : null;
}
function getNumberFromJid(jid = '') {
  const m = String(jid).match(/(\d{5,})/);
  return m ? m[1] : String(jid);
}
function normalizeJidAny(jidOrNumber) {
  if (!jidOrNumber) return null;
  const s = String(jidOrNumber).trim();
  if (/@(s\.whatsapp\.net|lid)$/.test(s)) return jidNormalizedUser(s);
  const num = onlyDigits(s);
  return num ? `${num}@s.whatsapp.net` : null;
}
function extractMentionedJid(message) {
  const ctx = message.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned.length > 0) {
    return normalizeJidAny(mentioned[0]);
  }
  const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const num = onlyDigits(text);
  return normalizeJidAny(num);
}
function asAtMention(jid) {
  return '@' + getNumberFromJid(jid);
}

async function sudoCommand(sock, chatId, message) {
  const senderJid = message.key.participant || message.key.remoteJid;
  const ownerJid = normalizeJidAny(settings.ownerNumber);

  const isOwner = message.key.fromMe || (normalizeJidAny(senderJid) === ownerJid);

  let isSenderAdmin = false;
  if (chatId.endsWith('@g.us')) {
    try {
      const s = await isAdmin(sock, chatId, senderJid);
      isSenderAdmin = s.isSenderAdmin;
    } catch {}
  }

  const rawText = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
  const tokens = rawText.split(/\s+/);
  tokens.shift(); // buang ".sudo"

  // Namespace baru: `.sudo su <action> ...`
  // Tetap dukung lama: `.sudo <action> ...` (backward compatible)
  const nsOrAction = (tokens[0] || '').toLowerCase();
  let action = '';
  let restIdx = 0;

  if (nsOrAction === 'su') {
    action = (tokens[1] || '').toLowerCase();
    restIdx = 2;
  } else {
    // backward-compat (boleh dipertahankan / boleh dihapus)
    action = nsOrAction;
    restIdx = 1;
  }

  const rest = tokens.slice(restIdx);

  // === Help ===
  if (!action || !['add','del','remove','list'].includes(action)) {
    const helpTxt = [
      '╭─〔 🛡️ *SUDO MANAGER* 〕',
      '│ Kelola akses pengguna *Sudo / Admin Bot*',
      '│',
      '│ ⚙️ *Perintah:*',
      '│ • `.sudo su add @user`  → tambah sudo',
      '│ • `.sudo su del @user`  → hapus sudo',
      '│ • `.sudo su del 3`      → hapus berdasarkan nomor urut',
      '│ • `.sudo su list`       → tampilkan semua sudo',
      '│',
      '│ (Masih mendukung lama: `.sudo add|del|list`)',
      '╰──────────────────────────────',
      '✨ *Andika Bot*'
    ].join('\n');
    await sock.sendMessage(chatId, { text: helpTxt, ...channelInfo }, { quoted: message });
    return;
  }

  // === List ===
  if (action === 'list') {
    const list = await getSudoList();
    if (!list || list.length === 0) {
      await sock.sendMessage(chatId, {
        text: '🗒️ *Daftar Sudo kosong.*\nTambahkan dengan `.sudo su add @user`',
        ...channelInfo
      }, { quoted: message });
      return;
    }
    const norm = list.map(j => normalizeJidAny(j)).filter(Boolean);
    const rows = norm.map((jid, i) => `│ ${i + 1}. ${asAtMention(jid)}`).join('\n');

    const text = [
      '╭─〔 👑 *DAFTAR SUDO* 〕',
      rows,
      '╰──────────────────────────────',
      `⚡ Total: ${norm.length}  ✨ *Andika Bot*`
    ].join('\n');

    await sock.sendMessage(chatId, { text, mentions: norm, ...channelInfo }, { quoted: message });
    return;
  }

  // === Guard role: hanya owner/admin ===
  if (!isOwner && !isSenderAdmin) {
    await sock.sendMessage(chatId, {
      text: '❌ *Hanya owner atau admin grup yang dapat menambah/menghapus sudo.*',
      ...channelInfo
    }, { quoted: message });
    return;
  }

  // === Add ===
  if (action === 'add') {
    const target = extractMentionedJid(message) || normalizeJidAny(rest[0]);
    if (!target) {
      await sock.sendMessage(chatId, {
        text: '⚠️ Harap *mention* user atau tulis nomornya.\nContoh: `.sudo su add @user`',
        ...channelInfo
      }, { quoted: message });
      return;
    }
    const ok = await addSudo(target);
    const text = ok
      ? `✅ *Berhasil menambahkan Sudo:* ${asAtMention(target)}`
      : '❌ Gagal menambah sudo.';
    await sock.sendMessage(chatId, { text, mentions: [target], ...channelInfo }, { quoted: message });
    return;
  }

  // === Del / Remove ===
  if (action === 'del' || action === 'remove') {
    let target = extractMentionedJid(message);

    // nomor urut di list
    if (!target) {
      const idxArg = rest[0];
      if (idxArg && /^\d+$/.test(idxArg)) {
        const list = await getSudoList();
        if (!list || list.length === 0) {
          await sock.sendMessage(chatId, { text: '🗒️ Daftar Sudo kosong.', ...channelInfo }, { quoted: message });
          return;
        }
        const index = parseInt(idxArg, 10);
        if (index < 1 || index > list.length) {
          await sock.sendMessage(chatId, { text: `❌ Nomor urut tidak valid. Gunakan 1–${list.length}`, ...channelInfo }, { quoted: message });
          return;
        }
        target = normalizeJidAny(list[index - 1]);
      }
    }

    // nomor/JID langsung
    if (!target) {
      const rawTarget = rest[0];
      target = normalizeJidAny(rawTarget);
    }

    if (!target) {
      await sock.sendMessage(chatId, {
        text: '⚠️ Harap mention user, tulis nomornya, atau gunakan nomor urut dari `.sudo su list`.',
        ...channelInfo
      }, { quoted: message });
      return;
    }

    // jangan hapus owner
    const ownerRaw = normalizeJidAny(settings.ownerNumber);
    if (normalizeJidAny(target) === ownerRaw) {
      await sock.sendMessage(chatId, { text: '🚫 Owner tidak dapat dihapus dari daftar sudo.', ...channelInfo }, { quoted: message });
      return;
    }

    const ok = await removeSudo(target);
    const text = ok
      ? `🗑️ *Berhasil menghapus Sudo:* ${asAtMention(target)}`
      : '❌ Gagal menghapus Sudo.';
    await sock.sendMessage(chatId, { text, mentions: [target], ...channelInfo }, { quoted: message });
    return;
  }
}

module.exports = sudoCommand;
