const fs = require('fs');
const path = require('path');

// Function to clear a single directory
function clearDirectory(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            return { success: false, message: `📁 Folder tidak ditemukan: ${dirPath}` };
        }
        const files = fs.readdirSync(dirPath);
        let deletedCount = 0;
        for (const file of files) {
            try {
                const filePath = path.join(dirPath, file);
                const stat = fs.lstatSync(filePath);
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
                deletedCount++;
            } catch (err) {
                // Hanya log error
                console.error(`Error menghapus file ${file}:`, err);
            }
        }
        return { success: true, message: `🧹 Berhasil menghapus ${deletedCount} file di *${path.basename(dirPath)}*`, count: deletedCount };
    } catch (error) {
        console.error('Error di clearDirectory:', error);
        return { success: false, message: `❌ Gagal menghapus file di *${path.basename(dirPath)}*`, error: error.message };
    }
}

// Function to clear both tmp and temp directories
async function clearTmpDirectory() {
    const tmpDir = path.join(process.cwd(), 'tmp');
    const tempDir = path.join(process.cwd(), 'temp');
    const results = [];
    results.push(clearDirectory(tmpDir));
    results.push(clearDirectory(tempDir));
    // Combine results
    const success = results.every(r => r.success);
    const totalDeleted = results.reduce((sum, r) => sum + (r.count || 0), 0);
    const message = results.map(r => r.message).join(' | ');
    return { success, message, count: totalDeleted };
}

// Function to handle manual command
async function clearTmpCommand(sock, chatId, msg) {
    try {
        // Cek apakah user adalah owner
        const isOwner = msg.key.fromMe;
        if (!isOwner) {
            await sock.sendMessage(chatId, { 
                text: '⛔ *Perintah ini khusus pemilik bot!*'
            });
            return;
        }

        const result = await clearTmpDirectory();
        
        if (result.success) {
            await sock.sendMessage(chatId, { 
                text: `✅ ${result.message}`
            });
        } else {
            await sock.sendMessage(chatId, { 
                text: `❌ ${result.message}`
            });
        }

    } catch (error) {
        console.error('Error di perintah cleartmp:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ *Gagal membersihkan file sementara!*'
        });
    }
}

// Start automatic clearing every 6 hours
function startAutoClear() {
    // Jalan langsung saat startup
    clearTmpDirectory().then(result => {
        if (!result.success) {
            console.error(`[Auto Clear] ${result.message}`);
        }
        // Tidak perlu log jika sukses
    });

    // Interval setiap 6 jam
    setInterval(async () => {
        const result = await clearTmpDirectory();
        if (!result.success) {
            console.error(`[Auto Clear] ${result.message}`);
        }
        // Tidak perlu log jika sukses
    }, 6 * 60 * 60 * 1000); // 6 jam dalam milidetik
}

// Start the automatic clearing
startAutoClear();

module.exports = clearTmpCommand;
