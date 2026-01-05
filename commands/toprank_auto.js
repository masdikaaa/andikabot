// commands/toprank_auto.js — Auto Top Rank (pakai data topmembers) + ON/OFF per grup + Sertifikat
'use strict';

const fs   = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');
const isAdmin = require('../lib/isAdmin');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const Jimp = require('jimp');

const DATA_DIR      = path.join(__dirname, '..', 'data');
const TOGGLE_FILE   = path.join(DATA_DIR, 'toprank_auto.json');   // on/off per grup + last ranks
const COUNT_FILE    = path.join(DATA_DIR, 'messageCount.json');   // data dari topmembers
const CERT_TEMPLATE = path.join(__dirname, '..', 'assets', 'sertifikat.png');

// cooldown anti notif dobel (dalam ms)
const NOTIFY_COOLDOWN_MS = 60 * 1000; // 1 menit per user per rank (belum dipakai, bisa dipakai nanti)
const GROUP_COOLDOWN_MS  = 10 * 1000; // 10 detik antar notifikasi di satu grup

// Warna font hijau (#00410C)
const GREEN = { r: 0x00, g: 0x41, b: 0x0c };

// Struktur TOGGLE_FILE:
// {
//   "groups": {
//     "<groupJid>": {
//       "enabled": boolean,
//       "lastGroupNotifiedAt": number,
//       "users": {
//         "<userBaseJid>": {
//            "lastRank": number | null,
//            "lastNotifiedRank": number | null,
//            "lastNotifiedAt": number
//         }
//       }
//     }
//   }
// }

let cache = { groups: {} };

/** Normalisasi JID supaya LID → JID biasa */
function baseJid(jid) {
  try {
    return jidNormalizedUser(jid || '');
  } catch {
    return jid || '';
  }
}

/** KEY user di cache: selalu pakai baseJid */
function userKey(jid) {
  return baseJid(jid);
}

function loadToggle() {
  try {
    if (!fs.existsSync(TOGGLE_FILE)) {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      cache = { groups: {} };
      return;
    }

    const raw  = fs.readFileSync(TOGGLE_FILE, 'utf-8');
    const json = JSON.parse(raw);

    if (json && typeof json === 'object' && json.groups) {
      cache = { groups: json.groups };
    } else if (json && typeof json === 'object') {
      cache = { groups: json };
    } else {
      cache = { groups: {} };
    }

    // normalisasi + migrasi user state
    for (const gid of Object.keys(cache.groups)) {
      let g = cache.groups[gid] || {};
      if (typeof g.enabled !== 'boolean') g.enabled = false;
      if (!g.users || typeof g.users !== 'object') g.users = {};

      const normUsers = {};
      for (const uid of Object.keys(g.users)) {
        const u = g.users[uid] || {};
        const k = userKey(uid);

        const lastRank =
          typeof u.lastRank === 'number' ? u.lastRank : null;
        const lastNotifiedRank =
          typeof u.lastNotifiedRank === 'number' ? u.lastNotifiedRank : null;
        const lastNotifiedAt =
          typeof u.lastNotifiedAt === 'number' ? u.lastNotifiedAt : 0;

        if (!normUsers[k]) {
          normUsers[k] = { lastRank, lastNotifiedRank, lastNotifiedAt };
        } else {
          const existing = normUsers[k].lastRank;
          if (
            typeof lastRank === 'number' &&
            (existing === null || lastRank < existing)
          ) {
            normUsers[k].lastRank = lastRank;
          }
          if (typeof lastNotifiedRank === 'number') {
            normUsers[k].lastNotifiedRank = lastNotifiedRank;
          }
          if (lastNotifiedAt > (normUsers[k].lastNotifiedAt || 0)) {
            normUsers[k].lastNotifiedAt = lastNotifiedAt;
          }
        }
      }

      g.users = normUsers;
      if (typeof g.lastGroupNotifiedAt !== 'number') {
        g.lastGroupNotifiedAt = 0;
      }

      cache.groups[gid] = g;
    }
  } catch (e) {
    console.error('[toprank_auto] gagal load toggle:', e);
    cache = { groups: {} };
  }
}

function saveToggle() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      TOGGLE_FILE,
      JSON.stringify({ groups: cache.groups }, null, 2)
    );
  } catch (e) {
    console.error('[toprank_auto] gagal save toggle:', e);
  }
}

function ensureGroup(groupJid) {
  if (!cache.groups[groupJid]) {
    cache.groups[groupJid] = {
      enabled: false,
      users: {},
      lastGroupNotifiedAt: 0
    };
  } else {
    const g = cache.groups[groupJid];
    if (typeof g.enabled !== 'boolean') g.enabled = false;
    if (!g.users || typeof g.users !== 'object') g.users = {};
    if (typeof g.lastGroupNotifiedAt !== 'number') g.lastGroupNotifiedAt = 0;
  }
  return cache.groups[groupJid];
}

function isTopRankAutoEnabled(groupJid) {
  if (!groupJid || !groupJid.endsWith('@g.us')) return false;
  loadToggle();
  const g = cache.groups[groupJid];
  if (!g || typeof g.enabled !== 'boolean') return false;
  return g.enabled;
}

function setTopRankAutoEnabled(groupJid, enabled) {
  if (!groupJid || !groupJid.endsWith('@g.us')) return;
  loadToggle();
  const g = ensureGroup(groupJid);
  g.enabled = !!enabled;
  cache.groups[groupJid] = g;
  saveToggle();
}

/**
 * Hitung ranking user di grup berdasarkan messageCount.json
 */
function getUserRank(groupJid, userJid) {
  try {
    if (!groupJid || !userJid) return null;
    if (!fs.existsSync(COUNT_FILE)) return null;

    const raw  = fs.readFileSync(COUNT_FILE, 'utf-8');
    if (!raw) return null;
    const json = JSON.parse(raw);

    const groupsRoot =
      json && typeof json === 'object' && json.groups
        ? json.groups
        : json;

    if (!groupsRoot || typeof groupsRoot !== 'object') return null;
    const g = groupsRoot[groupJid];
    if (!g || typeof g !== 'object') return null;

    const membersRoot =
      g.members && typeof g.members === 'object'
        ? g.members
        : g;

    const arr = [];
    for (const [jid, info] of Object.entries(membersRoot)) {
      if (jid === 'isPublic') continue;
      if (!info || typeof info !== 'object') continue;
      const count = Number(
        info.count ?? info.total ?? info.messages ?? info.msgCount ?? 0
      );
      if (!count || Number.isNaN(count)) continue;
      arr.push({ jid, count });
    }

    if (!arr.length) return null;
    arr.sort((a, b) => b.count - a.count);

    let index = -1;
    const baseTarget = baseJid(userJid);
    for (let i = 0; i < arr.length; i++) {
      if (baseJid(arr[i].jid) === baseTarget) {
        index = i;
        break;
      }
    }

    if (index === -1) return null;

    return { rank: index + 1, count: arr[index].count };
  } catch (e) {
    console.error('[toprank_auto] gagal hitung rank:', e);
    return null;
  }
}

/* ===================== SERTIFIKAT ===================== */

/**
 * Coba ambil display name user:
 * 1. hintName dari handler (pushName dari pesan)
 * 2. kontak Baileys
 * 3. metadata grup
 * 4. fallback: nomor / "Member DevOps"
 */
async function resolveDisplayName(sock, groupJid, userJid, hintName) {
  try {
    const id     = jidNormalizedUser(userJid);
    const bareId = id.split('@')[0];

    if (hintName) {
      const nm = String(hintName).trim();
      if (nm) return nm;
    }

    const c = sock.contacts?.[id];
    if (c) {
      const nm = c.pushName || c.name || c.notify || c.verifiedName;
      if (nm) return nm;
    }

    if (groupJid.endsWith('@g.us')) {
      try {
        const meta     = await sock.groupMetadata(groupJid);
        const peserta  = meta.participants || [];
        const p        = peserta.find(x => jidNormalizedUser(x.id) === id);
        if (p && p.id) {
          const cc = sock.contacts?.[jidNormalizedUser(p.id)];
          if (cc) {
            const nm = cc.pushName || cc.name || cc.notify || cc.verifiedName;
            if (nm) return nm;
          }
        }
      } catch {}
    }

    if (bareId) return bareId;
    return 'Member DevOps';
  } catch {
    return 'Member DevOps';
  }
}

/** Recolor semua pixel hitam di layer jadi warna GREEN */
function recolorBlackTo(img, color) {
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (_x, _y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const a = this.bitmap.data[idx + 3];

    if (a > 0 && r < 16 && g < 16 && b < 16) {
      this.bitmap.data[idx + 0] = color.r;
      this.bitmap.data[idx + 1] = color.g;
      this.bitmap.data[idx + 2] = color.b;
    }
  });
}

/**
 * Cetak teks ke layer terpisah lalu diwarnai hijau dan di-composite ke baseImg
 * options.bold = true → cetak berlapis biar kelihatan lebih tebal
 */
function printGreenBlock(baseImg, font, text, x, y, w, h, alignY, options = {}) {
  const { bold = false } = options;
  const layer = new Jimp(w, h, 0x00000000);

  const offsets = bold
    ? [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1]
      ]
    : [[0, 0]];

  for (const [dx, dy] of offsets) {
    layer.print(
      font,
      dx,
      dy,
      {
        text,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
        alignmentY: alignY
      },
      w,
      h
    );
  }

  recolorBlackTo(layer, GREEN);
  baseImg.composite(layer, x, y);
}

/**
 * Render sertifikat jadi buffer PNG
 */
async function createCertificateBuffer(memberName, rank, count) {
  try {
    if (!fs.existsSync(CERT_TEMPLATE)) {
      console.warn('[toprank_auto] Template sertifikat tidak ditemukan:', CERT_TEMPLATE);
      return null;
    }

    const img = await Jimp.read(CERT_TEMPLATE);
    const W   = img.bitmap.width;
    const H   = img.bitmap.height;

    const fontName = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontDesc = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

    const NAME_Y = 700;
    const DESC_Y = 880;

    const safeName = String(memberName || '').replace(/\s+/g, ' ').trim() || 'Member DevOps';

    printGreenBlock(
      img,
      fontName,
      safeName.toUpperCase(),
      0,
      NAME_Y,
      W,
      110,
      Jimp.VERTICAL_ALIGN_MIDDLE,
      { bold: true }
    );

    const descText =
      `Sebagai bentuk apresiasi atas partisipasi aktif ${safeName} di grub WhatsApp DevOps Engineer.\n\n` +
      'Terimakasih sudah membantu menjaga diskusi tetap hidup, bermanfaat, dan kondusif.';

    const marginX = Math.floor(W * 0.17);
    const boxW    = W - marginX * 2;
    const boxH    = H * 0.22;

    printGreenBlock(
      img,
      fontDesc,
      descText,
      marginX,
      DESC_Y,
      boxW,
      boxH,
      Jimp.VERTICAL_ALIGN_TOP,
      { bold: false }
    );

    return await img.getBufferAsync(Jimp.MIME_PNG);
  } catch (e) {
    console.error('[toprank_auto] createCertificateBuffer error:', e);
    return null;
  }
}

/**
 * Kirim sertifikat AUTO (tanpa quoted, bukan reply ke pesan apa pun)
 */
async function sendTopRankCertificate(sock, groupJid, userJid, rank, count, displayNameHint) {
  try {
    const nick   = await resolveDisplayName(sock, groupJid, userJid, displayNameHint);
    const buffer = await createCertificateBuffer(nick, rank, count);
    if (!buffer) return;

    const base = jidNormalizedUser(userJid);

    await sock.sendMessage(
      groupJid,
      {
        image: buffer,
        mimetype: 'image/png',
        caption:
          '🏆 *CERTIFICATE OF ACHIEVEMENT*\n\n' +
          `Nama  : *${nick}*\n` +
          `Rank  : *#${rank}*\n` +
          `Pesan : *${count}* pesan\n\n` +
          'Terimakasih atas kontribusi aktifnya di grub WhatsApp DevOps Engineer 🙌',
        mentions: [base],
        ...channelInfo
      },
      {} // ⬅️ TANPA quoted → tidak reply ke pesan mana pun
    );
  } catch (e) {
    console.error('[toprank_auto] sendTopRankCertificate error:', e);
  }
}

/* ===================== LOGIKA AUTO TOP RANK ===================== */

async function handleTopRankAutoAfterIncrement(sock, groupJid, userJid, displayNameHint) {
  try {
    if (!groupJid || !groupJid.endsWith('@g.us')) return;
    if (!userJid) return;

    loadToggle();
    const g = ensureGroup(groupJid);
    if (!g.enabled) return;

    const rankInfo = getUserRank(groupJid, userJid);
    const uKey     = userKey(userJid);
    const now      = Date.now();

    if (!g.users[uKey]) {
      g.users[uKey] = {
        lastRank: null,
        lastNotifiedRank: null,
        lastNotifiedAt: 0
      };
    }

    if (!rankInfo) {
      g.users[uKey].lastRank         = null;
      g.users[uKey].lastNotifiedRank = null;
      g.users[uKey].lastNotifiedAt   = 0;
      saveToggle();
      return;
    }

    const currentRank = rankInfo.rank;
    const count       = rankInfo.count;

    const prevRank =
      typeof g.users[uKey].lastRank === 'number'
        ? g.users[uKey].lastRank
        : null;
    const lastNotifiedRank =
      typeof g.users[uKey].lastNotifiedRank === 'number'
        ? g.users[uKey].lastNotifiedRank
        : null;
    const lastNotifiedAt =
      typeof g.users[uKey].lastNotifiedAt === 'number'
        ? g.users[uKey].lastNotifiedAt
        : 0;

    if (currentRank > 20) {
      g.users[uKey].lastRank         = currentRank;
      g.users[uKey].lastNotifiedRank = null;
      g.users[uKey].lastNotifiedAt   = 0;
      saveToggle();
      return;
    }

    if (lastNotifiedRank === currentRank) {
      g.users[uKey].lastRank = currentRank;
      saveToggle();
      return;
    }

    const base    = baseJid(userJid);
    const number  = (base.split('@')[0] || '').trim();
    const mention = number ? `@${number}` : 'kamu';

    const lastGroupNotifiedAt =
      typeof g.lastGroupNotifiedAt === 'number' ? g.lastGroupNotifiedAt : 0;

    // Masuk top 20 dari luar
    if (prevRank !== null && prevRank > 20) {
      if (now - lastGroupNotifiedAt < GROUP_COOLDOWN_MS) {
        g.users[uKey].lastRank = currentRank;
        saveToggle();
        return;
      }

      const txt = [
        '╭─〔 🏆 *TOP RANK UPDATE* 〕',
        `│ Selamat ${mention}! 🎉`,
        '│ Kamu *masuk 20 besar* di grup ini.',
        `│ Peringkatmu sekarang: *#${currentRank}* dengan *${count}* pesan.`,
        '│ ',
        '│ Tetap aktif di diskusi ya ✨',
        '╰────────────────────'
      ].join('\n');

      await sock.sendMessage(
        groupJid,
        {
          text: txt,
          ...(number ? { mentions: [base] } : {}),
          ...channelInfo
        },
        {} // ⬅️ TANPA quoted → auto notif bukan reply
      );

      await sendTopRankCertificate(
        sock,
        groupJid,
        userJid,
        currentRank,
        count,
        displayNameHint
      );

      g.users[uKey].lastRank         = currentRank;
      g.users[uKey].lastNotifiedRank = currentRank;
      g.users[uKey].lastNotifiedAt   = now;
      g.lastGroupNotifiedAt          = now;
      saveToggle();
      return;
    }

    // Naik rank di dalam top 20
    if (typeof prevRank === 'number' && prevRank <= 20 && currentRank < prevRank) {
      if (now - lastGroupNotifiedAt < GROUP_COOLDOWN_MS) {
        g.users[uKey].lastRank = currentRank;
        saveToggle();
        return;
      }

      const txt = [
        '╭─〔 🏆 *TOP RANK UPDATE* 〕',
        `│ Mantap ${mention}! 🚀`,
        `│ Peringkatmu *naik* dari *#${prevRank}* → *#${currentRank}*.`,
        `│ Total pesan: *${count}*`,
        '│ ',
        '│ Terus pertahankan keaktifanmu 🔥',
        '╰────────────────────'
      ].join('\n');

      await sock.sendMessage(
        groupJid,
        {
          text: txt,
          ...(number ? { mentions: [base] } : {}),
          ...channelInfo
        },
        {} // ⬅️ TANPA quoted → auto notif bukan reply
      );

      await sendTopRankCertificate(
        sock,
        groupJid,
        userJid,
        currentRank,
        count,
        displayNameHint
      );

      g.users[uKey].lastRank         = currentRank;
      g.users[uKey].lastNotifiedRank = currentRank;
      g.users[uKey].lastNotifiedAt   = now;
      g.lastGroupNotifiedAt          = now;
      saveToggle();
      return;
    }

    g.users[uKey].lastRank = currentRank;
    saveToggle();
  } catch (e) {
    console.error('[toprank_auto] error handleTopRankAutoAfterIncrement:', e);
  }
}

/* ===================== COMMAND HANDLER ===================== */

async function topRankAutoCommand(sock, chatId, message, argsRaw = '') {
  if (!chatId.endsWith('@g.us')) {
    await sock.sendMessage(
      chatId,
      { text: 'Perintah ini hanya bisa dipakai di *grup*.', ...channelInfo },
      { quoted: message }
    );
    return;
  }

  const senderId = message.key.participant || message.key.remoteJid;

  let isSenderAdmin = false;
  try {
    const st = await isAdmin(sock, chatId, senderId, message);
    isSenderAdmin = st.isSenderAdmin || message.key.fromMe;
  } catch (e) {
    console.error('[toprank_auto] gagal cek admin:', e);
  }

  if (!isSenderAdmin) {
    await sock.sendMessage(
      chatId,
      { text: '🚫 *Khusus Admin Grup / Owner Bot*', ...channelInfo },
      { quoted: message }
    );
    return;
  }

  loadToggle();
  const g        = ensureGroup(chatId);
  const rawArg   = (argsRaw || '').trim();
  const lowerArg = rawArg.toLowerCase();

  // .toprankauto print NAMA → sertifikat manual (INI MEMANG REPLY)
  if (lowerArg.startsWith('print')) {
    const name = rawArg.slice(5).trim();
    if (!name) {
      await sock.sendMessage(
        chatId,
        {
          text:
            '❌ Nama tidak boleh kosong.\n' +
            'Contoh:\n' +
            '• .toprankauto print Nama',
          ...channelInfo
        },
        { quoted: message }
      );
      return;
    }

    try {
      const buffer = await createCertificateBuffer(name, null, null);
      if (!buffer) {
        await sock.sendMessage(
          chatId,
          {
            text: '❌ Gagal membuat sertifikat. Pastikan template ada di *assets/sertifikat.png*',
            ...channelInfo
          },
          { quoted: message }
        );
        return;
      }

      await sock.sendMessage(
        chatId,
        {
          image: buffer,
          mimetype: 'image/png',
          caption:
            '🏆 *CERTIFICATE OF ACHIEVEMENT*\n\n' +
            `Nama  : *${name}*\n\n` +
            'Sertifikat ini dicetak manual oleh admin grub sebagai bentuk apresiasi. 🙌',
          ...channelInfo
        },
        { quoted: message } // ⬅️ manual print MEMANG reply ke command
      );

      return;
    } catch (e) {
      console.error('[toprank_auto] print manual error:', e);
      await sock.sendMessage(
        chatId,
        { text: '❌ Terjadi kesalahan saat mencetak sertifikat.', ...channelInfo },
        { quoted: message }
      );
      return;
    }
  }

  // STATUS
  if (!rawArg || lowerArg === 'status') {
    const statusText = g.enabled ? '✅ *ON*' : '❌ *OFF* (default)';
    const txt = [
      '╭─〔 🏆 *AUTO TOP RANK* 〕',
      `│ Status : ${statusText}`,
      '│ ',
      '│ 🔧 Pengaturan:',
      '│ • .toprankauto on             → aktifkan notif realtime top 20 + sertifikat',
      '│ • .toprankauto off            → matikan notif',
      '│ • .toprankauto status         → cek status',
      '│ • .toprankauto print NAMA     → cetak sertifikat manual dengan nama bebas',
      '│ ',
      '│ ℹ️ Bot akan kirim notif & sertifikat ketika anggota:',
      '│    • Masuk 20 besar pertama kali',
      '│    • Naik peringkat di dalam top 20',
      '╰────────────────────'
    ].join('\n');

    await sock.sendMessage(
      chatId,
      { text: txt, ...channelInfo },
      { quoted: message }
    );
    return;
  }

  if (lowerArg === 'on') {
    g.enabled = true;
    cache.groups[chatId] = g;
    saveToggle();

    await sock.sendMessage(
      chatId,
      {
        text:
          '✅ *Auto Top Rank* telah *AKTIF* di grup ini.\n' +
          'Bot akan mengirim notif + sertifikat ketika anggota masuk/naik di 20 besar.',
        ...channelInfo
      },
      { quoted: message }
    );
    return;
  }

  if (lowerArg === 'off') {
    g.enabled = false;
    cache.groups[chatId] = g;
    saveToggle();

    await sock.sendMessage(
      chatId,
      {
        text:
          '❌ *Auto Top Rank* telah *DIMATIKAN* di grup ini.\n' +
          'Data tetap tercatat, hanya notif realtime & sertifikat yang dihentikan.',
        ...channelInfo
      },
      { quoted: message }
    );
    return;
  }

  const helpTxt = [
    '❌ Argumen tidak dikenal.',
    '',
    'Gunakan:',
    '• .toprankauto on',
    '• .toprankauto off',
    '• .toprankauto status',
    '• .toprankauto print NAMA'
  ].join('\n');

  await sock.sendMessage(
    chatId,
    { text: helpTxt, ...channelInfo },
    { quoted: message }
  );
}

module.exports = {
  isTopRankAutoEnabled,
  setTopRankAutoEnabled,
  getUserRank,
  handleTopRankAutoAfterIncrement,
  topRankAutoCommand
};
