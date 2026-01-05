const { setAntilink, getAntilink, removeAntilink } = require('../lib/index');
const { readWhitelist, writeWhitelist, normalizeDomain } = require('../lib/antilink');

async function handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
  try {
    if (!isSenderAdmin) {
      await sock.sendMessage(chatId, { text: '🚫 *Khusus Admin Grup!*' }, { quoted: message });
      return;
    }

    const prefix = '.';
    const raw = (userMessage || '').trim();
    const args = raw.slice(prefix.length).split(/\s+/); // ["antilink", ...]
    const subArgs = raw.slice((`${prefix}antilink`).length).trim();
    const action = subArgs.split(/\s+/)[0]?.toLowerCase();

    // HELP CARD (dinamis)
    if (!action) {
      const cfg = await getAntilink(chatId, 'on').catch(() => null);
      const enabled = cfg?.enabled ? '✅ Aktif' : '🟡 Nonaktif';
      const act = (cfg?.action || 'delete');
      const actIcon = act === 'kick' ? '👢 Kick' : act === 'warn' ? '⚠️ Warn' : '🗑 Hapus';

      const text = [
        '🛡️  *ANTILINK*',
        '━━━━━━━━━━━━━━━━━━',
        `*Status:* ${enabled}   *Aksi:* ${actIcon}`,
        '',
        '*Perintah Utama*',
        `• \`${prefix}antilink on\`  — Aktifkan`,
        `• \`${prefix}antilink off\` — Nonaktifkan`,
        `• \`${prefix}antilink set <delete|kick|warn>\` — Ubah aksi`,
        `• \`${prefix}antilink get\` — Lihat konfigurasi`,
        '',
        '*Whitelist Domain/URL*',
        `• \`${prefix}antilink add namadomain.tld\``,
        `• \`${prefix}antilink add https://namadomain.tld\``,
        `• \`${prefix}antilink del <domain/url>\``,
        `• \`${prefix}antilink list\` — Lihat whitelist`,
        '',
        '*Catatan:* Semua link di pesan harus ada di whitelist agar tidak ditindak.'
      ].join('\n');
      await sock.sendMessage(chatId, { text }, { quoted: message });
      return;
    }

    // SUBCOMMANDS
    const parts = subArgs.split(/\s+/);
    switch (action) {
      case 'on': {
        const cfg = await getAntilink(chatId, 'on');
        if (cfg?.enabled) {
          await sock.sendMessage(chatId, { text: '✅ Antilink sudah aktif.' }, { quoted: message });
          return;
        }
        const ok = await setAntilink(chatId, 'on', (cfg?.action || 'delete'));
        await sock.sendMessage(chatId, { text: ok ? '✅ Antilink diaktifkan.' : '❌ Gagal mengaktifkan.' }, { quoted: message });
        break;
      }

      case 'off': {
        await removeAntilink(chatId, 'on');
        await sock.sendMessage(chatId, { text: '🟡 Antilink dimatikan.' }, { quoted: message });
        break;
      }

      case 'set': {
        const act = parts[1]?.toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(act)) {
          await sock.sendMessage(chatId, { text: `❌ Pilih aksi: *delete*, *kick*, atau *warn*.` }, { quoted: message });
          return;
        }
        const ok = await setAntilink(chatId, 'on', act);
        await sock.sendMessage(chatId, { text: ok ? `⚙️ Aksi diatur ke *${act}*.` : '❌ Gagal mengatur aksi.' }, { quoted: message });
        break;
      }

      case 'get': {
        const cfg = await getAntilink(chatId, 'on');
        const text = [
          '📋 *Konfigurasi Antilink*',
          `• Status : ${cfg?.enabled ? '*ON*' : '*OFF*'}`,
          `• Aksi   : *${cfg?.action || 'delete'}*`,
        ].join('\n');
        await sock.sendMessage(chatId, { text }, { quoted: message });
        break;
      }

      case 'add': {
        const rawTarget = subArgs.slice('add'.length + 1).trim();
        if (!rawTarget) {
          await sock.sendMessage(chatId, { text: `⚠️ Gunakan: \`${prefix}antilink add <domain/url>\`` }, { quoted: message });
          return;
        }
        const domain = normalizeDomain(rawTarget);
        if (!domain) {
          await sock.sendMessage(chatId, { text: '❌ Domain/URL tidak valid.' }, { quoted: message });
          return;
        }
        const wl = readWhitelist();
        const keys = wl.map(normalizeDomain);
        if (keys.includes(domain)) {
          await sock.sendMessage(chatId, { text: `ℹ️ *${domain}* sudah ada di whitelist.` }, { quoted: message });
          return;
        }
        wl.push(domain);
        writeWhitelist(wl);
        await sock.sendMessage(chatId, { text: `✅ *${domain}* ditambahkan ke whitelist.` }, { quoted: message });
        break;
      }

      case 'del':
      case 'delete':
      case 'remove': {
        const rawTarget = subArgs.slice(action.length + 1).trim();
        if (!rawTarget) {
          await sock.sendMessage(chatId, { text: `⚠️ Gunakan: \`${prefix}antilink del <domain/url>\`` }, { quoted: message });
          return;
        }
        const domain = normalizeDomain(rawTarget);
        if (!domain) {
          await sock.sendMessage(chatId, { text: '❌ Domain/URL tidak valid.' }, { quoted: message });
          return;
        }
        const wl = readWhitelist();
        const idx = wl.map(normalizeDomain).indexOf(domain);
        if (idx === -1) {
          await sock.sendMessage(chatId, { text: `❌ *${domain}* tidak ditemukan di whitelist.` }, { quoted: message });
          return;
        }
        const removed = wl[idx];
        wl.splice(idx, 1);
        writeWhitelist(wl);
        await sock.sendMessage(chatId, { text: `🗑️ *${removed}* dihapus dari whitelist.` }, { quoted: message });
        break;
      }

      case 'list': {
        const wl = [...new Set(readWhitelist().map(normalizeDomain))].sort((a,b)=>a.localeCompare(b));
        if (!wl.length) {
          await sock.sendMessage(chatId, { text: '📂 Whitelist kosong. Tambah dengan `.antilink add <domain>`' }, { quoted: message });
          return;
        }
        const csv = wl.join(', ');
        let text = [
          '🔏 *WHITELIST LINK*',
          '',
          csv,
          '',
          `🧮 Total: *${wl.length}*`
        ].join('\n');

        if (text.length > 3500) {
          const head = '🔏 *WHITELIST LINK*\n\n';
          const foot = `\n\n🧮 Total: *${wl.length}*`;
          const limit = 3500 - head.length - foot.length;
          const truncated = csv.slice(0, limit);
          text = head + truncated.replace(/,\s*$/, '') + '\n\n… (dipotong — terlalu panjang)' + foot;
        }
        await sock.sendMessage(chatId, { text }, { quoted: message });
        break;
      }

      default: {
        await sock.sendMessage(chatId, { text: `ℹ️ Gunakan \`${prefix}antilink\` untuk bantuan.` }, { quoted: message });
      }
    }
  } catch (error) {
    console.error('Error in antilink command:', error);
    await sock.sendMessage(chatId, { text: '❌ Terjadi kesalahan saat memproses perintah antilink.' }, { quoted: message });
  }
}

module.exports = { handleAntilinkCommand };
