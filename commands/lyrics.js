// commands/lyrics.js
const fetch = require('node-fetch');
const { channelInfo } = require('../lib/messageConfig');

// Bersihkan dan rapikan teks lirik
function cleanLyrics(raw, title = '') {
  if (!raw) return '';

  let cleaned = raw
    .replace(/^\s*[\d]+\s*Contributors?/i, '')
    .replace(/Lyrics/gi, '')
    .replace(/Embed$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Jika judul nempel di awal → pisahkan ke baris baru
  if (title && cleaned.toLowerCase().startsWith(title.toLowerCase())) {
    cleaned = cleaned.replace(new RegExp(`^${title}`, 'i'), `${title}\n`);
  }

  // Kalau baris pertama sama dengan judul → hapus aja
  const lines = cleaned.split('\n').map(l => l.trim());
  if (lines[0]?.toLowerCase() === title.toLowerCase()) {
    lines.shift();
  }

  return lines.join('\n').trim();
}

async function lyricsCommand(sock, chatId, songTitle, message) {
  try {
    if (!songTitle) {
      const usage =
`🎶 *FITUR LIRIK LAGU*  

📘 *Cara pakai:*  
> .lyrics <judul lagu>  

📍 *Contoh:*  
> .lyrics Kartonyono Medot Janji  
> .lyrics Shape of You`;

      await sock.sendMessage(chatId, { text: usage, ...channelInfo }, { quoted: message });
      return;
    }

    await sock.sendMessage(chatId, { react: { text: '🎧', key: message.key } });

    const apiUrl = `https://lyricsapi.fly.dev/api/lyrics?q=${encodeURIComponent(songTitle)}`;
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'AndikaBot/3.0' } });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);

    const data = await res.json();
    const result = data?.result;
    const lyricsRaw = result?.lyrics;
    const artist = result?.artist || 'Tidak diketahui';
    const title = result?.title || songTitle;

    if (!lyricsRaw) {
      await sock.sendMessage(chatId, {
        text: `❌ *Lirik untuk* "${songTitle}" *tidak ditemukan.*`,
        ...channelInfo
      }, { quoted: message });
      return;
    }

    // Rapikan hasil
    const lyrics = cleanLyrics(lyricsRaw, title);
    const maxChars = 3500;
    const shortLyrics = lyrics.length > maxChars ? lyrics.slice(0, maxChars) + '\n\n🎵 _(Lirik dipotong...)_' : lyrics;

    const caption =
`╭─〔 🎼 *LIRIK LAGU* 〕
│ 🎙️ *Penyanyi:* ${artist}
╰───────────────────────

${shortLyrics}

✨ *Lirik diambil & dirapikan oleh Andika Bot*`;

    await sock.sendMessage(chatId, { text: caption, ...channelInfo }, { quoted: message });

  } catch (error) {
    console.error('[Lyrics Command Error]', error);
    await sock.sendMessage(chatId, {
      text: `❌ *Gagal mengambil lirik untuk* "${songTitle}".\n\nCoba lagi nanti ya! 🎶`,
      ...channelInfo
    }, { quoted: message });
  }
}

module.exports = { lyricsCommand };
