// lib/antibadword.js — FINAL STABLE
// Deteksi kata/frasa terlarang dengan regex "fuzzy" + boundary huruf:
// - Huruf boleh berulang: "jancokkkk" cocok ke "jancok"
// - Bisa diselipi tanda baca/simbol/spasi/underscore di antara huruf: "a.s.u", "anji***ng", "ndas---koplak"
// - Case-insensitive + Unicode
// - Boundary aman: tidak match bila hanya substring di dalam kata panjang
//   (mis. "cok" tidak kena di "cokrominto", "sinting" tidak kena di "sinkron")
//
// Aksi: delete | warn (3x → kick) | kick
// Admin/Sudo kebal

'use strict';

const fs = require('fs');
const path = require('path');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const {
  setAntiBadword,
  getAntiBadword,
  removeAntiBadword,
  incrementWarningCount,
  resetWarningCount,
  isSudo
} = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

const BADWORDS_PATH = path.join(__dirname, '../data/badwords.json');

/* ===============================
   File helpers
================================ */
function ensureBadwordsFile() {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(BADWORDS_PATH)) {
    fs.writeFileSync(BADWORDS_PATH, JSON.stringify([], null, 2));
  }
}

function readBadwords() {
  ensureBadwordsFile();
  try {
    const raw = fs.readFileSync(BADWORDS_PATH, 'utf8') || '[]';
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Normalisasi: buang kosong & terlalu pendek (panjang 1 huruf → di-skip)
    return arr
      .map(x => (typeof x === 'string' ? x : String(x || '')))
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length >= 2);
  } catch (e) {
    console.error('⚠️ Gagal baca badwords.json:', e.message);
    return [];
  }
}

function writeBadwords(list) {
  ensureBadwordsFile();
  try {
    const cleaned = (list || [])
      .map(x => (typeof x === 'string' ? x : String(x || '')))
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length >= 2);
    fs.writeFileSync(BADWORDS_PATH, JSON.stringify(cleaned, null, 2));
    return true;
  } catch (e) {
    console.error('⚠️ Gagal tulis badwords.json:', e.message);
    return false;
  }
}

const normWord = s => (s || '').toLowerCase().trim();

/* ===============================
   Regex fuzzy builder (dengan boundary huruf)
================================ */
function escapeRegex(s) {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Buat regex "fuzzy" untuk frasa, namun dibatasi boundary huruf:
 * - Tiap huruf → <huruf>+[\W_]* (boleh diulang & diselipi non-word/underscore)
 * - Antar-kata → [\W_]* (spasi fleksibel / tanda baca)
 * - Boundary:
 *     • Sebelum huruf pertama: bukan huruf (atau awal teks)  → (?<!\p{L})
 *     • Setelah huruf terakhir: bukan huruf (atau akhir teks) → (?!\p{L})
 *
 * Contoh:
 *   "asu" → (?<!\p{L})a+[\W_]*s+[\W_]*u+(?!\p{L})
 *
 * Dampak:
 * - "cok" TIDAK match pada "cokrominto"/"coklat" (ada huruf setelahnya)
 * - "sinting" TIDAK match pada "sinkron" (huruf T wajib muncul)
 * - Tetap match pada "c.o.k", "cok!!!", "*c**o**k*", dst.
 */
function makePhraseRegex(phrase) {
  const base = (phrase || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!base) return null;
  if (base.length < 2) return null; // terlalu pendek → skip

  const tokens = base.split(' ').map(word => {
    const chars = [...word]; // unicode-safe
    const pieces = chars.map(ch => `${escapeRegex(ch)}+[\\W_]*`);
    return pieces.join('');
  });

  const corePattern = tokens.join('[\\W_]*');

  const boundaryBefore = '(?<!\\p{L})';
  const boundaryAfter = '(?!\\p{L})';

  try {
    return new RegExp(boundaryBefore + corePattern + boundaryAfter, 'iu');
  } catch (e) {
    console.error('⚠️ Gagal buat regex untuk frasa:', phrase, e.message);
    return null;
  }
}

/** Cache regex biar nggak bikin ulang tiap pesan */
const regexCache = new Map();
function getCachedRegex(term) {
  const key = normWord(term).replace(/\s+/g, ' ');
  if (!key || key.length < 2) return null;

  if (regexCache.has(key)) return regexCache.get(key);

  const rx = makePhraseRegex(key);
  if (rx) regexCache.set(key, rx);
  return rx;
}

/* ===============================
   UI helper
================================ */
function buildViolationCard({ title, userDigits, matched, bodyLines = [] }) {
  const lines = [
    `┏━〔 ${title} 〕━┓`,
    `┊ 👤 @${userDigits}`,
    matched ? `┊ 🔎 Cocok: "*${matched}*"` : null,
    `┊ ❗ Kata/Frasa terlarang *tidak diperbolehkan*.`,
    ...bodyLines.map(l => `┊ ${l}`),
    `┊ 💡 Jika kata ini *sebenarnya aman*, laporkan ke admin untuk *hapus dari daftar hitam*.`,
    `┗━━━━━━━━━━━━━━━━━━━━━━┛`
  ].filter(Boolean);
  return lines.join('\n');
}

/* ===============================
   COMMAND HANDLER
================================ */
const WARN_LIMIT = 3;

async function handleAntiBadwordCommand(sock, chatId, message, match) {
  try {
    ensureBadwordsFile();
    const full = (match || '').trim();
    const args = full.split(/\s+/);
    const sub = args[0]?.toLowerCase();

    // bantuan + status
    if (!sub) {
      const cfg = await getAntiBadword(chatId, 'on').catch(() => null);
      const enabled = cfg?.enabled ? '✅ Aktif' : '🟡 Nonaktif';
      const act = (cfg?.action || 'delete');
      const actIcon =
        act === 'kick' ? '👢 Kick' :
        act === 'warn' ? '⚠️ Warn' :
        '🗑 Hapus';

      const text = [
        '🛡️  *ANTIBADWORD*',
        '━━━━━━━━━━━━━━━━━━',
        `*Status:* ${enabled}   *Aksi:* ${actIcon}`,
        '',
        '*Perintah Utama*',
        '• `.antibadword on`  — Aktifkan',
        '• `.antibadword off` — Nonaktifkan',
        '• `.antibadword set <delete|kick|warn>` — Ubah aksi',
        '• `.antibadword list` — Lihat semua kata',
        '',
        '*Kelola Kata*',
        '• `.antibadword add <kata>` — Tambah satu',
        '• `.antibadword add k1, k2, k 3, bang jago` — Tambah massal (pisah koma, dukung spasi)',
        '• `.antibadword del <kata>` — Hapus satu',
        '• `.antibadword edit "kata lama" "kata baru"` — Ganti frasa (disarankan pakai kutip)',
        '',
        '*Contoh Cepat*',
        '• `.antibadword set warn` (peringatan 3x → kick)',
        '• `.antibadword add kata1, kata 2, bang jago`',
        '• `.antibadword edit "anda anjing" "anda jahat"`'
      ].join('\n');

      return sock.sendMessage(chatId, { text }, { quoted: message });
    }

    // LIST
    if (sub === 'list') {
      const words = [...new Set(
        readBadwords().map(w => normWord(w).replace(/\s+/g, ' '))
      )]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      if (!words.length) {
        return sock.sendMessage(
          chatId,
          { text: '📂 Daftar kata kosong. Tambah dengan *.antibadword add <kata>*' },
          { quoted: message }
        );
      }

      const csv = words.join(', ');
      let text = [
        '🧾 *DAFTAR KATA TERLARANG*',
        '',
        csv,
        '',
        `🧮 Total: *${words.length}*`
      ].join('\n');

      if (text.length > 3500) {
        const limit = 3500;
        const head = '🧾 *DAFTAR KATA TERLARANG*\n\n';
        const foot = `\n\n🧮 Total: *${words.length}*`;
        const room = limit - head.length - foot.length;
        const truncated = csv.slice(0, room);
        await sock.sendMessage(
          chatId,
          {
            text:
              head +
              truncated.replace(/,\s*$/, '') +
              '\n\n… (dipotong — terlalu panjang)' +
              foot
          },
          { quoted: message }
        );
      } else {
        await sock.sendMessage(chatId, { text }, { quoted: message });
      }
      return;
    }

    // ADD
    if (sub === 'add') {
      const pos = full.toLowerCase().indexOf('add');
      const payload = pos === -1 ? '' : full.slice(pos + 3).trim();

      if (!payload) {
        return sock.sendMessage(
          chatId,
          {
            text:
              '⚠️ Gunakan:\n' +
              '• *.antibadword add <kata>*\n' +
              '• *.antibadword add k1, k2, k 3, bang jago*'
          },
          { quoted: message }
        );
      }

      let rawItems;
      if (payload.includes(',')) {
        rawItems = payload
          .split(',')
          .map(s => s.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
      } else {
        rawItems = [payload];
      }

      const seen = new Set();
      const MIN_LEN = 2;
      const items = [];

      for (const it of rawItems) {
        const cleaned = it.replace(/\s+/g, ' ').trim();
        const key = normWord(cleaned);
        if (!key || seen.has(key) || cleaned.length < MIN_LEN) continue;
        seen.add(key);
        items.push(cleaned);
      }

      if (!items.length) {
        return sock.sendMessage(
          chatId,
          { text: '⚠️ Tidak ada kata valid untuk ditambahkan (minimal 2 karakter).' },
          { quoted: message }
        );
      }

      const list = readBadwords();
      const existingKeys = new Set(
        list.map(x => normWord(x).replace(/\s+/g, ' '))
      );

      if (items.length === 1) {
        const only = items[0];
        const key = normWord(only).replace(/\s+/g, ' ');
        if (existingKeys.has(key)) {
          return sock.sendMessage(
            chatId,
            { text: `ℹ️ Kata "*${only}*" sudah pernah ditambahkan.` },
            { quoted: message }
          );
        }
        list.push(only);
        writeBadwords(list);
        regexCache.clear(); // reset cache biar ikut kata baru
        return sock.sendMessage(
          chatId,
          { text: `✅ Kata "*${only}*" berhasil ditambahkan.` },
          { quoted: message }
        );
      }

      const addedItems = [];
      const skippedItems = [];

      for (const it of items) {
        const key = normWord(it).replace(/\s+/g, ' ');
        if (existingKeys.has(key)) {
          skippedItems.push(it);
          continue;
        }
        list.push(it);
        existingKeys.add(key);
        addedItems.push(it);
      }

      writeBadwords(list);
      regexCache.clear();

      const lines = [];
      lines.push(`✅ *${addedItems.length}* kata ditambahkan`);
      if (addedItems.length) {
        const showAdd = addedItems.slice(0, 20).join(', ');
        lines.push(`➕ ${showAdd}${addedItems.length > 20 ? ', …' : ''}`);
      }

      if (skippedItems.length) {
        const showSkip = skippedItems.slice(0, 20).join(', ');
        lines.push('');
        lines.push('ℹ️ Kata berikut *sudah pernah ditambahkan* (di-skip):');
        lines.push(`↪️ ${showSkip}${skippedItems.length > 20 ? ', …' : ''}`);
      }

      return sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
    }

    // DEL
    if (['del', 'delete', 'remove'].includes(sub)) {
      const wordRaw = args.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      const word = normWord(wordRaw).replace(/\s+/g, ' ');
      if (!word) {
        return sock.sendMessage(
          chatId,
          { text: '⚠️ Gunakan: *.antibadword del <kata>*' },
          { quoted: message }
        );
      }

      const list = readBadwords();
      const normed = list.map(x => normWord(x).replace(/\s+/g, ' '));
      const idx = normed.indexOf(word);
      if (idx === -1) {
        return sock.sendMessage(
          chatId,
          { text: `❌ Kata "*${wordRaw}*" tidak ditemukan.` },
          { quoted: message }
        );
      }

      const removed = list[idx];
      list.splice(idx, 1);
      writeBadwords(list);
      regexCache.clear();

      return sock.sendMessage(
        chatId,
        { text: `🗑️ Kata "*${removed}*" dihapus.` },
        { quoted: message }
      );
    }

    // EDIT
    if (sub === 'edit') {
      const pos = full.toLowerCase().indexOf('edit');
      const rest = pos === -1 ? '' : full.slice(pos + 4).trim();

      let m = rest.match(/^"([^"]+)"\s+"([^"]+)"$/);
      let oldWordKey, oldWordShow, newWord;

      if (m) {
        oldWordShow = m[1].replace(/\s+/g, ' ').trim();
        oldWordKey = normWord(oldWordShow).replace(/\s+/g, ' ');
        newWord = m[2].replace(/\s+/g, ' ').trim();
      } else {
        const parts = rest.split(/\s+/);
        const oldRaw = (parts.shift() || '').trim();
        oldWordShow = oldRaw;
        oldWordKey = normWord(oldRaw).replace(/\s+/g, ' ');
        newWord = parts.join(' ').replace(/\s+/g, ' ').trim();
      }

      if (!oldWordKey || !newWord) {
        return sock.sendMessage(
          chatId,
          {
            text:
              '⚠️ Gunakan:\n' +
              '• *.antibadword edit "kata lama" "kata baru"*\n' +
              '• atau: *.antibadword edit kata_lama kata baru*'
          },
          { quoted: message }
        );
      }

      const list = readBadwords();
      const normed = list.map(x => normWord(x).replace(/\s+/g, ' '));
      const idx = normed.indexOf(oldWordKey);
      if (idx === -1) {
        return sock.sendMessage(
          chatId,
          { text: `❌ Kata "*${oldWordShow}*" tidak ditemukan.` },
          { quoted: message }
        );
      }

      const targetKey = normWord(newWord).replace(/\s+/g, ' ');
      const alreadyExists = normed.includes(targetKey);

      if (alreadyExists) {
        const removed = list[idx];
        list.splice(idx, 1);
        writeBadwords(list);
        regexCache.clear();
        return sock.sendMessage(
          chatId,
          { text: `✏️ Kata "*${removed}*" dihapus karena "*${newWord}*" sudah ada.` },
          { quoted: message }
        );
      } else {
        list[idx] = newWord;
        writeBadwords(list);
        regexCache.clear();
        return sock.sendMessage(
          chatId,
          { text: `✅ Kata "*${oldWordShow}*" diubah menjadi "*${newWord}*".` },
          { quoted: message }
        );
      }
    }

    // ON / OFF / SET
    if (sub === 'on') {
      const existing = await getAntiBadword(chatId, 'on');
      if (existing?.enabled) {
        return sock.sendMessage(
          chatId,
          { text: '✅ Antibadword sudah aktif.' },
          { quoted: message }
        );
      }
      const ok = await setAntiBadword(chatId, 'on', existing?.action || 'delete');
      return sock.sendMessage(
        chatId,
        { text: ok ? '✅ Antibadword diaktifkan.' : '❌ Gagal mengaktifkan.' },
        { quoted: message }
      );
    }

    if (sub === 'off') {
      const existing = await getAntiBadword(chatId, 'on');
      if (!existing?.enabled) {
        return sock.sendMessage(
          chatId,
          { text: '🟡 Antibadword sudah nonaktif.' },
          { quoted: message }
        );
      }
      await removeAntiBadword(chatId, 'on');
      return sock.sendMessage(
        chatId,
        { text: '🟡 Antibadword dinonaktifkan.' },
        { quoted: message }
      );
    }

    if (sub === 'set') {
      const action = args[1]?.toLowerCase();
      if (!['delete', 'kick', 'warn'].includes(action)) {
        return sock.sendMessage(
          chatId,
          { text: '❌ Pilih aksi: *delete*, *kick*, atau *warn*.' },
          { quoted: message }
        );
      }
      const ok = await setAntiBadword(chatId, 'on', action);
      return sock.sendMessage(
        chatId,
        { text: ok ? `⚙️ Aksi diatur ke *${action}*.` : '❌ Gagal mengatur aksi.' },
        { quoted: message }
      );
    }

    return sock.sendMessage(
      chatId,
      { text: 'ℹ️ Gunakan *.antibadword* untuk bantuan.' },
      { quoted: message }
    );
  } catch (err) {
    console.error('❌ Error handleAntiBadwordCommand:', err);
    await sock.sendMessage(chatId, { text: '❌ Terjadi kesalahan.' }, { quoted: message });
  }
}

/* ===============================
   DETEKSI PESAN (fuzzy + boundary huruf)
================================ */
async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
  try {
    ensureBadwordsFile();
    if (!chatId?.endsWith?.('@g.us')) return;
    if (message?.key?.fromMe) return;

    const antiBadwordConfig = await getAntiBadword(chatId, 'on');
    if (!antiBadwordConfig?.enabled) return;

    // Ambil teks mentah (lowercase), tidak dibersihkan
    const rawText = (
      message?.message?.conversation ||
      message?.message?.extendedTextMessage?.text ||
      message?.message?.imageMessage?.caption ||
      message?.message?.videoMessage?.caption ||
      userMessage ||
      ''
    ).toLowerCase();

    if (!rawText.trim()) return;

    // Kalau nggak ada huruf sama sekali, skip (mis: cuma emoji / angka)
    if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(rawText)) return;

    const bad = readBadwords();
    if (!bad.length) return;

    // Cari kecocokan pertama
    let matched = null;

    for (const term of bad) {
      const rx = getCachedRegex(term);
      if (!rx) continue;

      const m = rawText.match(rx);
      if (m) {
        // Double-check: pastikan sisi kiri & kanan match benar-benar bukan huruf
        const idx = m.index;
        const before = idx > 0 ? rawText[idx - 1] : '';
        const after = rawText[idx + m[0].length] || '';

        const isLetter = ch => /\p{L}/u.test(ch);
        if (!isLetter(before || '') && !isLetter(after || '')) {
          matched = term;
          break;
        }
      }
    }

    if (!matched) return;

    // Cek admin/sudo
    let botIsAdmin = false;
    let senderIsAdmin = false;
    let senderIsSudo = false;

    try {
      const st = await isAdmin(sock, chatId, senderId, message);
      botIsAdmin = !!st.isBotAdmin;
      senderIsAdmin = !!st.isSenderAdmin;
    } catch {}

    try {
      senderIsSudo = !!(await isSudo(senderId));
    } catch {}

    // Admin/Sudo kebal
    if (senderIsAdmin || senderIsSudo) return;

    const targetJid = jidNormalizedUser(senderId);
    const userDigits = (targetJid.split('@')[0] || '').trim();

    if (!botIsAdmin) {
      const text = buildViolationCard({
        title: '⚠️ Antibadword Aktif (Bot Bukan Admin)',
        userDigits,
        matched,
        bodyLines: [
          '⛔ Bot tidak bisa menghapus/kick tanpa hak admin.',
          '🙏 Mohon jaga bahasa hingga admin mengatur perizinan.'
        ]
      });
      await sock.sendMessage(chatId, { text, mentions: [targetJid] });
      return;
    }

    // Hapus pesan
    try {
      await sock.sendMessage(chatId, { delete: message.key });
    } catch (e) {
      console.error('⚠️ Gagal menghapus pesan antibadword:', e?.message);
    }

    const action = String(antiBadwordConfig.action || 'delete')
      .toLowerCase()
      .trim();

    switch (action) {
      case 'delete': {
        const text = buildViolationCard({
          title: '🚫 Kata/Frasa Terlarang',
          userDigits,
          matched,
          bodyLines: ['✅ Pesan telah dihapus.']
        });
        await sock.sendMessage(chatId, { text, mentions: [targetJid] });
        break;
      }

      case 'kick': {
        try {
          await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove');
          const text = buildViolationCard({
            title: '🚫 KICK — Kata/Frasa Terlarang',
            userDigits,
            matched,
            bodyLines: ['👢 Anggota telah dikeluarkan dari grup.']
          });
          await sock.sendMessage(chatId, { text, mentions: [targetJid] });
        } catch (e) {
          console.error('Error kick antibadword:', e);
        }
        break;
      }

      case 'warn': {
        let count = 1;
        try {
          count = await incrementWarningCount(chatId, targetJid);
        } catch (e) {
          console.error('Error incrementWarningCount:', e);
        }

        if (count >= WARN_LIMIT) {
          try {
            await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove');
            await resetWarningCount(chatId, targetJid);
            const text = buildViolationCard({
              title: '🚫 KICK — Akumulasi Peringatan',
              userDigits,
              matched,
              bodyLines: [
                `⚠️ Melebihi *${WARN_LIMIT}* peringatan.`,
                '👢 Anggota telah dikeluarkan dari grup.'
              ]
            });
            await sock.sendMessage(chatId, { text, mentions: [targetJid] });
          } catch (e) {
            console.error('Error kick after warn:', e);
          }
        } else {
          const text = buildViolationCard({
            title: '⚠️ Peringatan',
            userDigits,
            matched,
            bodyLines: [
              `📣 Peringatan *${count}/${WARN_LIMIT}*. Mohon jaga bahasa.`
            ]
          });
          await sock.sendMessage(chatId, { text, mentions: [targetJid] });
        }
        break;
      }

      default: {
        // fallback: delete-only
        const text = buildViolationCard({
          title: '🚫 Kata/Frasa Terlarang',
          userDigits,
          matched,
          bodyLines: ['✅ Pesan telah dihapus.']
        });
        await sock.sendMessage(chatId, { text, mentions: [targetJid] });
        break;
      }
    }
  } catch (err) {
    console.error('❌ Error handleBadwordDetection:', err);
  }
}

module.exports = {
  handleAntiBadwordCommand,
  handleBadwordDetection
};
