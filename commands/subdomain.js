// commands/subdomain.js
const fetch = require('node-fetch');
const { channelInfo } = require('../lib/messageConfig');

async function subdomainCommand(sock, chatId, domain, message) {
  try {
    if (!domain) {
      const usage = `🌐 *PENCARI SUBDOMAIN*  

📘 *Cara pakai:*  
> .subdomain <domain>

📍 *Contoh:*  
> .subdomain siputzx.my.id`;
      await sock.sendMessage(chatId, { text: usage, ...channelInfo }, { quoted: message });
      return;
    }

    await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

    const apiUrl = `https://api.siputzx.my.id/api/tools/subdomains?domain=${encodeURIComponent(domain)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);

    const data = await res.json();
    const listRaw = data?.data || [];

    if (!Array.isArray(listRaw) || listRaw.length === 0) {
      await sock.sendMessage(chatId, { text: `❌ Tidak ditemukan subdomain untuk *${domain}*.` }, { quoted: message });
      return;
    }

    // Gabungkan semua subdomain, hilangkan duplikat, dan urutkan
    const subdomains = [
      ...new Set(
        listRaw
          .map(x => x.split('\n'))
          .flat()
          .map(s => s.trim())
          .filter(s => s && s.includes('.'))
      )
    ].sort();

    const maxShow = 50; // batas tampilan
    const shown = subdomains.slice(0, maxShow);
    const extra = subdomains.length > maxShow ? `\n\n🔹 Dan ${subdomains.length - maxShow} lainnya...` : '';

    const caption =
`╭─〔 🌐 *HASIL PENCARIAN SUBDOMAIN* 〕
│ 🔎 *Domain:* ${domain}
│ 📅 *Ditemukan:* ${subdomains.length} subdomain
╰───────────────────────

${shown.map((s, i) => `${i + 1}. ${s}`).join('\n')}${extra}

✨ *Diproses oleh Andika Bot*`;

    await sock.sendMessage(chatId, { text: caption, ...channelInfo }, { quoted: message });

  } catch (error) {
    console.error('[Subdomain Command Error]', error);
    await sock.sendMessage(chatId, {
      text: `❌ *Gagal mencari subdomain untuk* ${domain}.\n\nKemungkinan API sedang down atau domain tidak valid.`,
      ...channelInfo
    }, { quoted: message });
  }
}

module.exports = subdomainCommand;
