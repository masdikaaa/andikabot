// commands/topmembers.js
'use strict';

const fs = require('fs');
const path = require('path');

const dataFilePath    = path.join(__dirname, '..', 'data', 'messageCount.json');
const countedFilePath = path.join(__dirname, '..', 'data', '_countedIds.json'); // jejak msgId

/** ---------- UTIL WAKTU (INDONESIA) ---------- */
function formatTanggalID(d) {
  const hari  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][d.getMonth()];
  const tgl   = String(d.getDate()).padStart(2, '0');
  const th    = d.getFullYear();
  return `${hari}, ${tgl} ${bulan} ${th}`;
}

function formatTanggalSingkatID(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '-';
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()];
  const tgl   = String(d.getDate()).padStart(2, '0');
  const th    = d.getFullYear();
  return `${tgl} ${bulan} ${th}`;
}

/** ---------- I/O JSON ---------- */
function ensureFile(p, initial) {
  try {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(initial ?? {}, null, 2));
    }
  } catch {
    // kalau gagal, biarin saja; load berikutnya akan fallback ke {}
  }
}

function loadJsonSafe(p, fallback) {
  ensureFile(p, fallback);
  try {
    const data = fs.readFileSync(p, 'utf8');
    if (!data) return { ...fallback };
    const parsed = JSON.parse(data);
    return (parsed && typeof parsed === 'object') ? parsed : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJsonSafe(p, obj) {
  try {
    fs.writeFileSync(p, JSON.stringify(obj || {}, null, 2));
  } catch {
    // jangan bikin bot mati hanya gara-gara gagal nulis file
  }
}

function loadMessageCounts() {
  return loadJsonSafe(dataFilePath, {});
}

function saveMessageCounts(messageCounts) {
  saveJsonSafe(dataFilePath, messageCounts);
}

/** ---------- DEDUP MSG-ID (persisten) ---------- */
function loadCounted() {
  return loadJsonSafe(countedFilePath, {});
}

function saveCounted(counted) {
  saveJsonSafe(countedFilePath, counted);
}

function alreadyCounted(counted, groupId, msgId) {
  if (!msgId || !groupId) return false;
  const g = counted[groupId];
  if (!g || typeof g !== 'object') return false;
  return !!g[msgId];
}

function markCounted(counted, groupId, msgId) {
  if (!msgId || !groupId) return;
  if (!counted[groupId] || typeof counted[groupId] !== 'object') {
    counted[groupId] = {};
  }
  counted[groupId][msgId] = Date.now();
}

function trimCounted(counted) {
  const MAX_PER_GROUP = 5000;       // batas aman
  const TTL_MS        = 7 * 24 * 3600e3;   // hapus yg >7 hari
  const now           = Date.now();

  for (const gid of Object.keys(counted || {})) {
    const entries = Object.entries(counted[gid] || {});
    if (!entries.length) {
      delete counted[gid];
      continue;
    }

    const fresh = entries.filter(([, ts]) => (now - Number(ts)) <= TTL_MS);
    if (!fresh.length) {
      delete counted[gid];
      continue;
    }

    fresh.sort((a, b) => Number(b[1]) - Number(a[1]));
    const kept = fresh.slice(0, MAX_PER_GROUP);
    counted[gid] = Object.fromEntries(kept);
  }
}

/** ---------- NORMALISASI ENTRY ---------- */
function normalizeEntry(entry) {
  if (typeof entry === 'number') {
    return { count: entry, since: null };
  }
  if (entry && typeof entry === 'object') {
    const count = Number(entry.count) || 0;
    const since = entry.since || null;
    return { count, since };
  }
  return { count: 0, since: null };
}

/**
 * Tambah 1 hanya sekali per message id.
 * @param {string} groupId - jid grup (xxx@g.us)
 * @param {string} userId  - jid pengirim (xxx@s.whatsapp.net)
 * @param {string} [msgId] - message.key.id untuk dedup (opsional tapi disarankan)
 */
function incrementMessageCount(groupId, userId, msgId) {
  if (!groupId || !userId) return;

  // Muat jejak ID + cek sudah dihitung atau belum
  const counted = loadCounted();
  if (msgId && alreadyCounted(counted, groupId, msgId)) {
    return; // sudah dihitung, jangan dobel
  }

  // Muat counter pesan
  const messageCounts = loadMessageCounts();
  if (!messageCounts[groupId] || typeof messageCounts[groupId] !== 'object') {
    messageCounts[groupId] = {};
  }

  const prev   = normalizeEntry(messageCounts[groupId][userId]);
  const nowIso = new Date().toISOString();
  const since  = prev.since || nowIso;

  const next = { count: prev.count + 1, since };
  messageCounts[groupId][userId] = next;

  // Tulis realtime (sinkron, tapi aman untuk single process)
  saveMessageCounts(messageCounts);

  // Tandai msgId sudah dihitung & trim
  if (msgId) {
    markCounted(counted, groupId, msgId);
    trimCounted(counted);
    saveCounted(counted);
  }
}

/** ---------- SYNC & AUTO-HAPUS USER YG KELUAR ---------- */
/**
 * Hapus dari messageCount.json semua user yg tidak ada di currentJids.
 * Return: jumlah data yang dihapus.
 */
function pruneLeftMembersFromJson(groupId, currentJids) {
  if (!groupId) return 0;

  const messageCounts = loadMessageCounts();
  const groupCounts   = (messageCounts[groupId] && typeof messageCounts[groupId] === 'object')
    ? messageCounts[groupId]
    : {};

  let removed = 0;
  const keys = Object.keys(groupCounts);
  if (!keys.length) return 0;

  for (const jid of keys) {
    if (!currentJids.has(jid)) {
      delete groupCounts[jid];
      removed++;
    }
  }

  // kalau grup jadi kosong, tetap simpan objek kosong
  messageCounts[groupId] = groupCounts;
  if (removed > 0) {
    saveMessageCounts(messageCounts);
  }
  return removed;
}

/**
 * Hapus instan data 1 user saat leave/kick.
 * Panggil ini di listener event peserta.
 */
function removeUserFromGroupCounts(groupId, userJid) {
  if (!groupId || !userJid) return;

  const messageCounts = loadMessageCounts();
  if (messageCounts[groupId] && messageCounts[groupId][userJid]) {
    delete messageCounts[groupId][userJid];
    saveMessageCounts(messageCounts);
  }
}

/** ---------- RANKING (TOP 20 & HANYA MEMBER AKTIF) ---------- */
async function topMembers(sock, chatId, isGroup) {
  if (!sock || !chatId) return;

  if (!isGroup) {
    try {
      await sock.sendMessage(chatId, { text: 'Perintah ini hanya tersedia di grup.' });
    } catch {}
    return;
  }

  let currentJids = new Set();
  let botJid = null;

  try {
    const meta = await sock.groupMetadata(chatId);
    const participants = meta?.participants || [];
    currentJids = new Set(participants.map(p => p.id).filter(Boolean));
  } catch {
    // kalau gagal ambil metadata, currentJids dibiarkan kosong -> tidak prune
  }

  try {
    botJid = sock?.user?.id || null;
  } catch {
    botJid = null;
  }

  // 🔧 PRUNE: hapus otomatis dari JSON yang sudah keluar
  if (currentJids.size > 0) {
    pruneLeftMembersFromJson(chatId, currentJids);
  }

  const messageCounts = loadMessageCounts();
  const groupCountsRaw = (messageCounts[chatId] && typeof messageCounts[chatId] === 'object')
    ? messageCounts[chatId]
    : {};

  const normalized = Object.entries(groupCountsRaw)
    .map(([jid, val]) => [jid, normalizeEntry(val)])
    .filter(([jid, info]) => {
      // hanya member aktif kalau kita punya daftar peserta
      if (currentJids.size > 0 && !currentJids.has(jid)) return false;
      // skip bot sendiri kalau ke-record
      if (botJid && jid === botJid) return false;
      return (info.count || 0) > 0;
    });

  const sortedMembers = normalized
    .sort(([, a], [, b]) => (b.count - a.count))
    .slice(0, 20);

  if (sortedMembers.length === 0) {
    try {
      await sock.sendMessage(chatId, { text: 'Belum ada aktivitas pesan yang tercatat dari member aktif.' });
    } catch {}
    return;
  }

  const today   = formatTanggalID(new Date());
  const mentions = [];

  let msg = [
    '┏━━━━━━━━━━━━━━━━━━━━━━',
    '┃ 🏆 *TOP 20 MEMBER GRUP*',
    `┃ 📅 ${today}`,
    '┗━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ].join('\n');

  sortedMembers.forEach(([userId, info], idx) => {
    const at  = `@${userId.split('@')[0]}`;
    const m   = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅';
    const sinceTxt = info.since ? formatTanggalSingkatID(info.since) : '-';

    msg += [
      `${m} *#${idx + 1}* ${at}`,
      `   ├─ ✉️ Pesan : *${info.count}*`,
      `   └─ 🗓️ Sejak : ${sinceTxt}`,
      ''
    ].join('\n');

    mentions.push(userId);
  });

  msg += '_Terima kasih sudah aktif! Keep the chat alive ✨_';

  try {
    await sock.sendMessage(chatId, { text: msg, mentions });
  } catch {
    // jangan bikin bot mati kalau kirim pesan gagal
  }
}

module.exports = {
  incrementMessageCount,
  topMembers,
  pruneLeftMembersFromJson,
  removeUserFromGroupCounts
};
