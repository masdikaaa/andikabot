// lib/messageConfig.js
const fs = require('fs');
const path = require('path');

/* ===== DEFAULT aman (tidak memaksa SID) ===== */
const DEFAULTS = {
  jid: '120363421594431163@newsletter',
  name: 'Andika Community',
  serverMessageId: null                 // ← jangan paksa angka
};

/* ===== Optional: ./data/channels.json =====
{
  "default": {
    "jid": "1203xxxxxxxxxxxxx@newsletter",
    "name": "Andika Community",
    "serverMessageId": 123        // opsional; hapus jika tak menunjuk post
  }
}
*/
function readConfigFile() {
  try {
    const p = path.join(__dirname, '..', 'data', 'channels.json');
    if (!fs.existsSync(p)) return null;
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    return obj?.default || null;
  } catch {
    return null;
  }
}

/* ===== ENV override (opsional) =====
   CHANNEL_JID=1203...@newsletter
   CHANNEL_NAME="Andika Community"
   CHANNEL_SID=123              // opsional
*/
function envConfig() {
  const jid = process.env.CHANNEL_JID?.trim();
  const name = process.env.CHANNEL_NAME?.trim();
  const sidStr = process.env.CHANNEL_SID;
  const sid = (sidStr !== undefined && sidStr !== '') ? Number(sidStr) : null;
  return { jid, name, serverMessageId: sid };
}

function normalizeJid(jid) {
  if (!jid) return null;
  const s = String(jid).trim();
  if (s.endsWith('@newsletter')) return s;
  const digits = s.replace(/[^\d]/g, '');
  return digits ? `${digits}@newsletter` : null;
}

function pickConfig() {
  const fromEnv  = envConfig();
  const fromFile = readConfigFile();

  const jid  = normalizeJid(fromEnv.jid || fromFile?.jid || DEFAULTS.jid);
  const name = (fromEnv.name || fromFile?.name || DEFAULTS.name || 'Channel').trim();

  // pakai SID hanya jika valid (>0)
  let sid = fromEnv.serverMessageId ?? fromFile?.serverMessageId ?? DEFAULTS.serverMessageId;
  sid = (Number.isInteger(sid) && sid > 0) ? sid : null;

  return { jid, name, serverMessageId: sid };
}

/* ===== Export contextInfo ===== */
Object.defineProperty(module.exports, 'channelInfo', {
  get() {
    const { jid, name, serverMessageId } = pickConfig();
    if (!jid) return {};

    const forwarded = {
      newsletterJid: jid,
      newsletterName: name
      // HANYA tambahkan serverMessageId jika benar-benar ada
    };
    if (serverMessageId) forwarded.serverMessageId = serverMessageId;

    return {
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: forwarded,

      }
    };
  }
});
