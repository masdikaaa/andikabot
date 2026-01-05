// commands/dnscheck.js
const axios = require('axios');

// ========= Resolver publik (ringkasan global) =========
const PROVIDERS = [
  { name: 'Google DNS',  info: 'Global',    url: 'https://dns.google/resolve' },
  { name: 'Cloudflare',  info: 'Global',    url: 'https://cloudflare-dns.com/dns-query' },
];

const SUPPORTED = new Set(['A','AAAA','CNAME','MX','NS','TXT']);

// ========= Per Negara via EDNS Client Subnet (Google DoH) =========
const COUNTRY_PROBES = [
  { cc:'US', flag:'🇺🇸', name:'United States (Oregon)',    ecs:'34.208.0.0/16' },
  { cc:'US', flag:'🇺🇸', name:'United States (Virginia)',  ecs:'3.80.0.0/16' },
  { cc:'CA', flag:'🇨🇦', name:'Canada (Central)',          ecs:'35.183.0.0/16' },
  { cc:'BR', flag:'🇧🇷', name:'Brazil (São Paulo)',        ecs:'18.228.0.0/16' },
  { cc:'GB', flag:'🇬🇧', name:'United Kingdom (London)',   ecs:'51.140.0.0/16' },
  { cc:'DE', flag:'🇩🇪', name:'Germany (Frankfurt)',       ecs:'18.156.0.0/16' },
  { cc:'FR', flag:'🇫🇷', name:'France (Paris)',            ecs:'15.236.0.0/16' },
  { cc:'NL', flag:'🇳🇱', name:'Netherlands (AMS)',         ecs:'13.94.0.0/16' },
  { cc:'SE', flag:'🇸🇪', name:'Sweden (Stockholm)',        ecs:'13.48.0.0/16' },
  { cc:'IN', flag:'🇮🇳', name:'India (Mumbai)',            ecs:'13.126.0.0/16' },
  { cc:'SG', flag:'🇸🇬', name:'Singapore',                 ecs:'54.251.0.0/16' },
  { cc:'JP', flag:'🇯🇵', name:'Japan (Tokyo)',             ecs:'54.150.0.0/16' },
  { cc:'AU', flag:'🇦🇺', name:'Australia (Sydney)',        ecs:'52.62.0.0/16' },
  { cc:'AE', flag:'🇦🇪', name:'UAE (Dubai/Bahrain)',       ecs:'15.185.0.0/16' },
  { cc:'ZA', flag:'🇿🇦', name:'South Africa (Cape Town)',  ecs:'13.244.0.0/16' },
];

function parseArgs(raw) {
  const text = (raw || '').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  let domain = parts[0] || '';
  let type = (parts[1] || 'A').toUpperCase();
  const noCountries = parts.includes('--nocountries');
  // perbaiki urutan jika user salah (".dnscheck A domain.com")
  if (domain && !domain.includes('.') && SUPPORTED.has(domain.toUpperCase()) && parts[1]?.includes('.')) {
    type = domain.toUpperCase(); domain = parts[1];
  }
  return { domain, type, noCountries };
}

function validDomain(d) { return /^[a-z0-9-_.]+$/i.test(d) && d.length <= 253 && d.includes('.'); }
const uniq = arr => [...new Set(arr)];

function extractAnswers(resp) {
  const arr = Array.isArray(resp?.Answer) ? resp.Answer : [];
  return arr.map(a => {
    let data = String(a.data ?? '').trim();
    if (a.type === 16 && ((data.startsWith('"') && data.endsWith('"')) || (data.startsWith("'") && data.endsWith("'")))) {
      data = data.slice(1, -1); // TXT: buang kutip
    }
    return { data, ttl: a.TTL, type: a.type, name: a.name };
  });
}

function prettyList(list) {
  if (!list.length) return '-';
  return uniq(list.map(v => v.data)).slice(0, 5).join(', ');
}

function majority(list) {
  const freq = new Map();
  for (const s of list) freq.set(s, (freq.get(s) || 0) + 1);
  let best = null, n = 0;
  for (const [k, v] of freq) if (v > n) { best = k; n = v; }
  return { value: best, count: n, total: list.length };
}

function flagFromInfo(info) {
  if (/CN/i.test(info)) return '🇨🇳';
  if (/CH/i.test(info)) return '🇨🇭';
  return '🌐';
}

async function queryProvider(provider, domain, type) {
  const isGoogle = provider.url.includes('dns.google/resolve');
  const params = isGoogle ? { name: domain, type, edns_client_subnet: '0.0.0.0/0' } : { name: domain, type };
  try {
    const { data } = await axios.get(provider.url, {
      params,
      headers: { accept: 'application/dns-json' },
      timeout: 8000
    });
    return { ok: true, provider, answers: extractAnswers(data) };
  } catch {
    return { ok: false, provider, answers: [] }; // disembunyikan, tidak dipakai
  }
}

async function queryCountryECS(domain, type, ecs) {
  try {
    const { data } = await axios.get('https://dns.google/resolve', {
      params: { name: domain, type, edns_client_subnet: ecs },
      headers: { accept: 'application/dns-json' },
      timeout: 8000
    });
    return { ok: true, answers: extractAnswers(data) };
  } catch {
    return { ok: false, answers: [] }; // disembunyikan, tidak dipakai
  }
}

module.exports = async function dnscheckCommand(sock, chatId, message, rawArgs) {
  const { domain, type, noCountries } = parseArgs(rawArgs);

  if (!domain) {
    await sock.sendMessage(chatId, { text:
`⚠️ Format:
.dnscheck <domain> [type] [--nocountries]

Contoh:
• .dnscheck google.com
• .dnscheck mail.domain.id MX
• .dnscheck domain.com --nocountries

Tipe: A, AAAA, CNAME, MX, NS, TXT`

    }, { quoted: message });
    return;
  }
  if (!validDomain(domain)) {
    await sock.sendMessage(chatId, { text: '❌ Domain tidak valid.' }, { quoted: message });
    return;
  }

  const qType = SUPPORTED.has(type) ? type : 'A';
  const waitMsg = await sock.sendMessage(chatId, { text: `🔎 Mengecek DNS *${domain}* (record *${qType}*)…` }, { quoted: message });

  // ===== Global (hanya yang OK) =====
  const results = await Promise.all(PROVIDERS.map(p => queryProvider(p, domain, qType)));
  const ok = results.filter(r => r.ok && r.answers.length);

  const flat = ok.flatMap(r => r.answers.map(a => a.data)).filter(Boolean);
  const maj = flat.length ? majority(flat) : { value: '-', count: 0, total: 0 };
  const pct = ok.length ? Math.round((maj.count / ok.length) * 100) : 0;

  let out = [
    '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '┃ 🌍 *DNS PROPAGATION CHECK*',
    `┃ 🟢 Tersinkron: *${ok.length}* dari *${results.length}* resolver`,
    `┃ 📈 Propagasi (mayoritas): *${pct}%*`,
    '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ].join('\n');

  if (maj.value && maj.value !== '-') out += `• Jawaban mayoritas: *${maj.value}*\n\n`;

  const globalLines = ok.map(r => {
    const ttl = r.answers[0]?.ttl ?? '-';
    return `${flagFromInfo(r.provider.info)} *${r.provider.name}* — ${prettyList(r.answers)} (TTL: ${ttl})`;
  });

  out += globalLines.slice(0, 20).join('\n');
  if (globalLines.length > 20) out += `\n…dan ${globalLines.length - 20} baris lagi.`;

  // ===== Per Negara (hanya yang OK) =====
  if (!noCountries) {
    out += `\n\n┏━━━━━━━━━━━━━━━━━━━━━━\n┃ 🗺️ *Per Negara (ECS)*\n┗━━━━━━━━━━━━━━━━━━━━━━\n`;
    const probes = COUNTRY_PROBES.slice(0, 15);
    const countryResults = await Promise.all(
      probes.map(async (p) => {
        const res = await queryCountryECS(domain, qType, p.ecs);
        return { probe: p, ...res };
      })
    );
    const okCountries = countryResults.filter(r => r.ok && r.answers.length);
    const lines = okCountries.map(({ probe, answers }) => {
      const ttl = answers[0]?.ttl ?? '-';
      return `${probe.flag} *${probe.name}* — ${prettyList(answers)} (TTL: ${ttl})`;
    });
    out += lines.length ? lines.join('\n') : '—';
    out += `\n\nℹ️ Bagian ini menggunakan *EDNS Client Subnet* untuk simulasi lokasi resolver per negara.`;
  }

  out += `\n\n_Tips:_ propagasi DNS tergantung TTL. Jika belum konsisten, cek NS, glue, dan TTL record.`;
  await sock.sendMessage(chatId, { text: out }, { quoted: waitMsg });
};
