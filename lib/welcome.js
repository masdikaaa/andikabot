// lib/welcome.js
// Tambahan: .welcome get/reset & .goodbye get/reset (reset = balik default TANPA custom teks, tetap ON)
const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('../lib/index');
const { delay } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/userGroupData.json');

// --- helper lokal buat GET/RESET (baca/tulis JSON) ---
function readJson() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    const raw = fs.readFileSync(DATA_PATH, 'utf8') || '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function writeJson(obj) {
  try {
    const tmp = DATA_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, DATA_PATH);
  } catch (e) {
    console.error('Gagal menulis userGroupData.json:', e);
  }
}

// ======================== WELCOME ========================
async function handleWelcome(sock, chatId, message, match) {
  if (!match) {
    return sock.sendMessage(chatId, {
      text: [
        '📥 *PENGATURAN WELCOME*',
        '',
        '✅ *.welcome on* — Aktifkan pesan sambutan',
        '🛠️ *.welcome set [pesan kamu]* — Atur pesan sambutan kustom',
        '🔎 *.welcome get* — Cek status & teks sambutan yang tersimpan',
        '♻️ *.welcome reset* — Kembalikan ke *default* (tanpa custom)',
        '🚫 *.welcome off* — Nonaktifkan pesan sambutan',
        '',
        '*Variabel yang bisa dipakai:*',
        '• {user} — Mention anggota baru',
        '• {group} — Nama grup',
        '• {description} — Deskripsi grup'
      ].join('\n'),
      quoted: message
    });
  }

  const [command, ...args] = match.split(' ');
  const lowerCommand = (command || '').toLowerCase();
  const customMessage = args.join(' ');

  // --- ON ---
  if (lowerCommand === 'on') {
    if (await isWelcomeOn(chatId)) {
      return sock.sendMessage(chatId, { text: '⚠️ *Welcome* sudah *AKTIF*.', quoted: message });
    }
    await addWelcome(chatId, true, 'Selamat datang {user} di {group}! 🎉');
    return sock.sendMessage(
      chatId,
      { text: '✅ *Welcome* telah *diaktifkan*. Gunakan *.welcome set [pesan]* untuk kustomisasi.', quoted: message }
    );
  }

  // --- OFF ---
  if (lowerCommand === 'off') {
    if (!(await isWelcomeOn(chatId))) {
      return sock.sendMessage(chatId, { text: '⚠️ *Welcome* sudah *NONAKTIF*.', quoted: message });
    }
    await delWelcome(chatId);
    return sock.sendMessage(chatId, { text: '✅ *Welcome* berhasil *dinonaktifkan* untuk grup ini.', quoted: message });
  }

  // --- SET <pesan> ---
  if (lowerCommand === 'set') {
    if (!customMessage) {
      return sock.sendMessage(chatId, { text: '⚠️ Mohon sertakan pesan kustom. Contoh: *.welcome set Selamat datang di {group}!*', quoted: message });
    }
    await addWelcome(chatId, true, customMessage);
    return sock.sendMessage(chatId, { text: '✅ Pesan *welcome kustom* berhasil disimpan.', quoted: message });
  }

  // --- GET (status + teks yang tersimpan) ---
  if (lowerCommand === 'get') {
    const data = readJson();
    const row = data?.welcome?.[chatId];
    const enabled = await isWelcomeOn(chatId);
    const msg = row?.message || row?.template || '(default)';
    const info = [
      '🛠️ *WELCOME STATUS*',
      `• Group   : ${chatId}`,
      `• Enabled : ${enabled ? 'ON' : 'OFF'}`,
      `• Message : ${msg}`
    ].join('\n');
    return sock.sendMessage(chatId, { text: info, quoted: message });
  }

  // --- RESET (balik default tanpa custom; enabled tetap) ---
  if (lowerCommand === 'reset') {
    const data = readJson();
    if (!data.welcome || typeof data.welcome !== 'object') data.welcome = {};
    const row = data.welcome[chatId] || {};

    if (row.message) delete row.message;
    if (row.template) delete row.template;

    row.enabled = true; // tetap ON agar default jalan
    data.welcome[chatId] = row;
    writeJson(data);

    return sock.sendMessage(chatId, { text: '♻️ *Welcome* direset ke *default* (tanpa custom).', quoted: message });
  }

  // Perintah tidak valid
  return sock.sendMessage(chatId, {
    text: [
      '❌ Perintah tidak valid.',
      'Gunakan:',
      '• *.welcome on* — Aktifkan',
      '• *.welcome set [pesan]* — Atur pesan',
      '• *.welcome get* — Cek status',
      '• *.welcome reset* — Kembali ke default',
      '• *.welcome off* — Nonaktifkan'
    ].join('\n'),
    quoted: message
  });
}

// ======================== GOODBYE ========================
async function handleGoodbye(sock, chatId, message, match) {
  if (!match) {
    return sock.sendMessage(chatId, {
      text: [
        '📤 *PENGATURAN GOODBYE*',
        '',
        '✅ *.goodbye on* — Aktifkan pesan perpisahan',
        '🛠️ *.goodbye set [pesan kamu]* — Atur pesan perpisahan kustom',
        '🔎 *.goodbye get* — Cek status & teks perpisahan yang tersimpan',
        '♻️ *.goodbye reset* — Kembalikan ke *default* (tanpa custom)',
        '🚫 *.goodbye off* — Nonaktifkan pesan perpisahan',
        '',
        '*Variabel yang bisa dipakai:*',
        '• {user} — Mention anggota yang keluar',
        '• {group} — Nama grup',
        '• {description} — Deskripsi grup (kalau kamu pakai)'
      ].join('\n'),
      quoted: message
    });
  }

  const [command, ...args] = match.split(' ');
  const lower = (command || '').toLowerCase();
  const customMessage = args.join(' ');

  if (lower === 'on') {
    if (await isGoodByeOn(chatId)) {
      return sock.sendMessage(chatId, { text: '⚠️ *Goodbye* sudah *AKTIF*.', quoted: message });
    }
    await addGoodbye(chatId, true, 'Sampai jumpa {user} 👋');
    return sock.sendMessage(
      chatId,
      { text: '✅ *Goodbye* telah *diaktifkan*. Gunakan *.goodbye set [pesan]* untuk kustomisasi.', quoted: message }
    );
  }

  if (lower === 'off') {
    if (!(await isGoodByeOn(chatId))) {
      return sock.sendMessage(chatId, { text: '⚠️ *Goodbye* sudah *NONAKTIF*.', quoted: message });
    }
    await delGoodBye(chatId);
    return sock.sendMessage(chatId, { text: '✅ *Goodbye* berhasil *dinonaktifkan* untuk grup ini.', quoted: message });
  }

  if (lower === 'set') {
    if (!customMessage) {
      return sock.sendMessage(chatId, { text: '⚠️ Mohon sertakan pesan kustom. Contoh: *.goodbye set Terima kasih sudah bergabung!*', quoted: message });
    }
    await addGoodbye(chatId, true, customMessage);
    return sock.sendMessage(chatId, { text: '✅ Pesan *goodbye kustom* berhasil disimpan.', quoted: message });
  }

  if (lower === 'get') {
    const data = readJson();
    const row = data?.goodbye?.[chatId];
    const enabled = await isGoodByeOn(chatId);
    const msg = row?.message || row?.template || '(default)';
    const info = [
      '🛠️ *GOODBYE STATUS*',
      `• Group   : ${chatId}`,
      `• Enabled : ${enabled ? 'ON' : 'OFF'}`,
      `• Message : ${msg}`
    ].join('\n');
    return sock.sendMessage(chatId, { text: info, quoted: message });
  }

  if (lower === 'reset') {
    const data = readJson();
    if (!data.goodbye || typeof data.goodbye !== 'object') data.goodbye = {};
    const row = data.goodbye[chatId] || {};

    if (row.message) delete row.message;
    if (row.template) delete row.template;

    row.enabled = true; // tetap ON agar default jalan
    data.goodbye[chatId] = row;
    writeJson(data);

    return sock.sendMessage(chatId, { text: '♻️ *Goodbye* direset ke *default* (tanpa custom).', quoted: message });
  }

  // Jika perintah tidak valid
  return sock.sendMessage(chatId, {
    text: [
      '❌ Perintah tidak valid.',
      'Gunakan:',
      '• *.goodbye on* — Aktifkan',
      '• *.goodbye set [pesan]* — Atur pesan',
      '• *.goodbye get* — Cek status',
      '• *.goodbye reset* — Kembali ke default',
      '• *.goodbye off* — Nonaktifkan'
    ].join('\n'),
    quoted: message
  });
}

module.exports = { handleWelcome, handleGoodbye };
