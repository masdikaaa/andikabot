// commands/google.js
const axios = require('axios');

async function fetchTopResults(q, limit = 6) {
  try {
    const url = 'https://lite.duckduckgo.com/lite/';
    const { data: html } = await axios.get(url, {
      params: { q },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 12000,
    });

    const results = [];
    const anchorRegex = /<a[^>]+href="([^"]*?uddg=([^"&]+)[^"]*)"[^>]*>(.*?)<\/a>/gi;
    let m;
    while ((m = anchorRegex.exec(html)) && results.length < limit) {
      const encodedUrl = m[2];
      const titleHtml = m[3] || '';
      let urlDecoded = '';
      try { urlDecoded = decodeURIComponent(encodedUrl); } catch { urlDecoded = encodedUrl; }

      const title = titleHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!urlDecoded || !title) continue;

      const after = html.slice(anchorRegex.lastIndex, anchorRegex.lastIndex + 350);
      const brMatch = after.match(/<\/a>\s*<br[^>]*>\s*([^<]{20,200})/i);
      const snippet = brMatch ? brMatch[1].replace(/\s+/g, ' ').trim() : '';

      results.push({ title, url: urlDecoded, snippet });
    }

    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
  } catch {
    return [];
  }
}

function formatResultsMessage(query, results) {
  const header = `🔎 *Hasil pencarian untuk:* _${query}_`;
  if (!results.length) return `${header}\n\n( Tidak ditemukan hasil yang relevan )`;

  const list = results
    .map((r, i) => {
      const host = (() => { try { return new URL(r.url).host; } catch { return ''; } })();
      const snip = r.snippet ? `\n   – ${r.snippet}` : '';
      return `${i + 1}. *${r.title}*\n   ${r.url}${host ? `  _(${host})_` : ''}${snip}`;
    })
    .join('\n\n');

  return `${header}\n\n${list}`;
}

function extractQuery(message) {
  const raw =
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    message?.message?.imageMessage?.caption ||
    message?.message?.videoMessage?.caption ||
    '';
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('.google')) return '';
  return trimmed.slice(7).trim();
}

async function googleCommand(sock, chatId, message) {
  const query = extractQuery(message);
  if (!query) {
    await sock.sendMessage(chatId, {
      text: '📘 *Cara pakai:* `.google <kata kunci>`\n\nContoh:\n.google apa itu devops\n.google tutorial git rebase\n.google docker vs podman'
    }, { quoted: message });
    return;
  }

  try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

  const results = await fetchTopResults(query, 6);
  const text = formatResultsMessage(query, results);

  await sock.sendMessage(chatId, { text }, { quoted: message });
}

module.exports = googleCommand;
