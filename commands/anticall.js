const fs = require('fs');

const ANTICALL_PATH = './data/anticall.json';

function readState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) return { enabled: false };
        const raw = fs.readFileSync(ANTICALL_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return { enabled: !!data.enabled };
    } catch {
        return { enabled: false };
    }
}

function writeState(enabled) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(ANTICALL_PATH, JSON.stringify({ enabled: !!enabled }, null, 2));
    } catch {}
}

async function anticallCommand(sock, chatId, message, args) {
    const state = readState();
    const sub = (args || '').trim().toLowerCase();

    if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status')) {
        await sock.sendMessage(
            chatId,
            {
                text:
`🛡️ *ANTICALL*

📞 *.anticall on*  — Aktifkan blokir otomatis saat ada panggilan masuk
🚫 *.anticall off* — Nonaktifkan Anticall
ℹ️ *.anticall status* — Lihat status saat ini`
            },
            { quoted: message }
        );
        return;
    }

    if (sub === 'status') {
        await sock.sendMessage(
            chatId,
            { text: `📊 Status Anticall saat ini: *${state.enabled ? '🟢 AKTIF' : '🔴 NONAKTIF'}*.` },
            { quoted: message }
        );
        return;
    }

    const enable = sub === 'on';
    writeState(enable);
    const icon = enable ? '✅' : '⛔';
    await sock.sendMessage(
        chatId,
        { text: `${icon} Anticall sekarang *${enable ? 'AKTIF' : 'NONAKTIF'}*.` },
        { quoted: message }
    );
}

module.exports = { anticallCommand, readState };
