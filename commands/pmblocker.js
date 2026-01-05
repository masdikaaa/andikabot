const fs = require('fs');
const { channelInfo } = require('../lib/messageConfig');

const PMBLOCKER_PATH = './data/pmblocker.json';
const DEFAULT_MSG =
  '⚠️ *Pesan pribadi diblokir!*\nKamu tidak bisa DM bot ini. Silakan hubungi owner lewat grup saja.';

function _ensureDataDir() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
}
function readState() {
  try {
    if (!fs.existsSync(PMBLOCKER_PATH)) {
      return { enabled: false, message: DEFAULT_MSG, blocked: [] };
    }
    const raw = fs.readFileSync(PMBLOCKER_PATH, 'utf8') || '{}';
    const data = JSON.parse(raw);
    return {
      enabled: !!data.enabled,
      message: (data.message && String(data.message).trim()) || DEFAULT_MSG,
      blocked: Array.isArray(data.blocked) ? data.blocked : []
    };
  } catch {
    return { enabled: false, message: DEFAULT_MSG, blocked: [] };
  }
}
function writeState(next) {
  try {
    _ensureDataDir();
    const cur = readState();
    const payload = {
      enabled: 'enabled' in next ? !!next.enabled : cur.enabled,
      message: 'message' in next ? (next.message || DEFAULT_MSG) : cur.message,
      blocked: Array.isArray(next.blocked) ? next.blocked : cur.blocked
    };
    fs.writeFileSync(PMBLOCKER_PATH, JSON.stringify(payload, null, 2));
    return payload;
  } catch { return readState(); }
}

// utils
const bannerTop = '╭─〔';
const bannerBot = '╰──────────────────────────────';
const brandLine = '✨ Andika Bot';

const buildUpdatedText = (enable) => [
  `${bannerTop} ✅ PM BLOCKER DIPERBARUI 〕`,
  `│ 🔘 Status Sekarang: ${enable ? '🟢 Aktif' : '🔴 Nonaktif'}`,
  `│ ${enable ? '🚫 Semua pesan pribadi (DM) akan otomatis diblokir.' : '💬 Bot sekarang dapat menerima pesan pribadi.'}`,
  `${bannerBot}`,
  `${brandLine}`,
].join('\n');

const buildStatusText = (state) => [
  `${bannerTop} 📊 STATUS PM BLOCKER 〕`,
  `│ 🔘 Status Sekarang: ${state.enabled ? '🟢 Aktif' : '🔴 Nonaktif'}`,
  `│ ${state.enabled ? '🚫 Mode ini hanya memblokir DM ke bot.' : '💬 DM ke bot diperbolehkan.'}`,
  `│ 🔒 Tercatat diblokir: ${state.blocked.length}`,
  `${bannerBot}`,
  `${brandLine}`,
].join('\n');

const buildMsgUpdated = (note) => [
  `${bannerTop} ✏️ PESAN PM BLOCKER 〕`,
  `│ ${note}`,
  `${bannerBot}`,
  `${brandLine}`,
].join('\n');

const buildHelpText = () => [
  `${bannerTop} 🛡️ PM BLOCKER 〕`,
  '│ ⚙️ Perintah:',
  '│ • .pmblocker on',
  '│ • .pmblocker off',
  '│ • .pmblocker status',
  '│ • .pmblocker setmsg <pesan>',
  '│ • .pmblocker setmsg del   (reset default)',
  '│ • .pmblocker unblock <nomor/@mention>',
  '│ • .pmblocker unblockall   (hapus semua blokir yg tercatat)',
  `${bannerBot}`,
  `${brandLine}`,
].join('\n');

function normJid(input) {
  if (!input) return null;
  const n = String(input).match(/\d{7,20}/);
  return n ? `${n[0]}@s.whatsapp.net` : null;
}

async function pmblockerCommand(sock, chatId, message, args) {
  const argStr = (args || '').trim();
  const [sub, ...rest] = argStr.split(/\s+/);
  const state = readState();

  const bad = !sub || !['on','off','status','setmsg','unblock','unblockall'].includes(sub.toLowerCase());
  if (bad) {
    await sock.sendMessage(chatId, { text: buildHelpText(), ...channelInfo }, { quoted: message });
    return;
  }

  if (sub.toLowerCase() === 'status') {
    await sock.sendMessage(chatId, { text: buildStatusText(state), ...channelInfo }, { quoted: message });
    return;
  }

  if (sub.toLowerCase() === 'setmsg') {
    const newMsg = rest.join(' ').trim();
    if (!newMsg || /^del$|^reset$/i.test(newMsg)) {
      writeState({ message: DEFAULT_MSG });
      await sock.sendMessage(chatId, { text: buildMsgUpdated('🧹 Pesan direset ke *default*.'), ...channelInfo }, { quoted: message });
    } else {
      writeState({ message: newMsg });
      await sock.sendMessage(chatId, { text: buildMsgUpdated('✅ Pesan PM Blocker diperbarui.'), ...channelInfo }, { quoted: message });
    }
    return;
  }

  if (sub.toLowerCase() === 'unblock') {
    // ambil dari mention / reply / nomor
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    let target = mentioned[0] || normJid(rest[0]);
    if (!target) {
      const replyJid = message.message?.extendedTextMessage?.contextInfo?.participant;
      target = replyJid || null;
    }
    if (!target) {
      await sock.sendMessage(chatId, { text: '📌 Contoh: `.pmblocker unblock 62812xxxx` atau reply/mention orangnya.' }, { quoted: message });
      return;
    }
    try { await sock.updateBlockStatus(target, 'unblock'); } catch {}
    const list = new Set(readState().blocked);
    list.delete(target);
    writeState({ blocked: [...list] });
    await sock.sendMessage(chatId, { text: `✅ Unblock: ${target}` }, { quoted: message });
    return;
  }

  if (sub.toLowerCase() === 'unblockall') {
    const now = readState();
    for (const jid of now.blocked) {
      try { await sock.updateBlockStatus(jid, 'unblock'); } catch {}
    }
    writeState({ blocked: [] });
    await sock.sendMessage(chatId, { text: '✅ Semua JID yang tercatat sudah di-unblock.' }, { quoted: message });
    return;
  }

  if (sub.toLowerCase() === 'on') {
    writeState({ enabled: true });
    await sock.sendMessage(chatId, { text: buildUpdatedText(true), ...channelInfo }, { quoted: message });
    return;
  }

  // OFF → juga auto-unblock semua yang tercatat
  if (sub.toLowerCase() === 'off') {
    const now = readState();
    for (const jid of now.blocked) {
      try { await sock.updateBlockStatus(jid, 'unblock'); } catch {}
    }
    writeState({ enabled: false, blocked: [] });
    await sock.sendMessage(chatId, { text: buildUpdatedText(false), ...channelInfo }, { quoted: message });
    return;
  }
}

module.exports = { pmblockerCommand, readState };
