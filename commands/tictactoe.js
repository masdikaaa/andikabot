const TicTacToe = require('../lib/tictactoe');

// Store games globally
const games = {};

async function tictactoeCommand(sock, chatId, senderId, text) {
    try {
        // Check if player is already in a game
        if (Object.values(games).find(room =>
            room.id.startsWith('tictactoe') &&
            [room.game.playerX, room.game.playerO].includes(senderId)
        )) {
            await sock.sendMessage(chatId, {
                text: '❌ Kamu masih berada di dalam permainan. Ketik *surrender* untuk keluar.'
            });
            return;
        }

        // Look for existing room
        let room = Object.values(games).find(room =>
            room.state === 'WAITING' &&
            (text ? room.name === text : true)
        );

        if (room) {
            // Join existing room
            room.o = chatId;
            room.game.playerO = senderId;
            room.state = 'PLAYING';

            const arr = room.game.render().map(v => ({
                'X': '❎',
                'O': '⭕',
                '1': '1️⃣',
                '2': '2️⃣',
                '3': '3️⃣',
                '4': '4️⃣',
                '5': '5️⃣',
                '6': '6️⃣',
                '7': '7️⃣',
                '8': '8️⃣',
                '9': '9️⃣',
            }[v]));

            const str = `
🎮 *Permainan TicTacToe Dimulai!*

Menunggu giliran @${room.game.currentTurn.split('@')[0]}...

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ *ID Room:* ${room.id}
▢ *Aturan:*
• Buat 3 simbol berurutan (vertikal, horizontal, atau diagonal) untuk menang
• Ketik angka (1–9) untuk menaruh simbolmu
• Ketik *surrender* untuk menyerah
`;

            // Send message only once to the group
            await sock.sendMessage(chatId, {
                text: str,
                mentions: [room.game.currentTurn, room.game.playerX, room.game.playerO]
            });

        } else {
            // Create new room
            room = {
                id: 'tictactoe-' + (+new Date),
                x: chatId,
                o: '',
                game: new TicTacToe(senderId, 'o'),
                state: 'WAITING'
            };

            if (text) room.name = text;

            await sock.sendMessage(chatId, {
                text: `⏳ *Menunggu lawan*\nKetik *.ttt ${text || ''}* untuk bergabung!`
            });

            games[room.id] = room;
        }

    } catch (error) {
        console.error('Error in tictactoe command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Gagal memulai permainan. Coba lagi.'
        });
    }
}

async function handleTicTacToeMove(sock, chatId, senderId, text) {
    try {
        // Find player's game
        const room = Object.values(games).find(room =>
            room.id.startsWith('tictactoe') &&
            [room.game.playerX, room.game.playerO].includes(senderId) &&
            room.state === 'PLAYING'
        );

        if (!room) return;

        const isSurrender = /^(surrender|give up)$/i.test(text);

        if (!isSurrender && !/^[1-9]$/.test(text)) return;

        // Allow surrender at any time, not just during player's turn
        if (senderId !== room.game.currentTurn && !isSurrender) {
            await sock.sendMessage(chatId, {
                text: '❌ Bukan giliranmu!'
            });
            return;
        }

        let ok = isSurrender ? true : room.game.turn(
            senderId === room.game.playerO,
            parseInt(text) - 1
        );

        if (!ok) {
            await sock.sendMessage(chatId, {
                text: '❌ Langkah tidak valid! Posisi tersebut sudah terisi.'
            });
            return;
        }

        let winner = room.game.winner;
        let isTie = room.game.turns === 9;

        const arr = room.game.render().map(v => ({
            'X': '❎',
            'O': '⭕',
            '1': '1️⃣',
            '2': '2️⃣',
            '3': '3️⃣',
            '4': '4️⃣',
            '5': '5️⃣',
            '6': '6️⃣',
            '7': '7️⃣',
            '8': '8️⃣',
            '9': '9️⃣',
        }[v]));

        if (isSurrender) {
            // Set the winner to the opponent of the surrendering player
            winner = senderId === room.game.playerX ? room.game.playerO : room.game.playerX;

            // Send a surrender message
            await sock.sendMessage(chatId, {
                text: `🏳️ @${senderId.split('@')[0]} menyerah! @${winner.split('@')[0]} memenangkan permainan!`,
                mentions: [senderId, winner]
            });

            // Delete the game immediately after surrender
            delete games[room.id];
            return;
        }

        let gameStatus;
        if (winner) {
            gameStatus = `🎉 @${winner.split('@')[0]} memenangkan permainan!`;
        } else if (isTie) {
            gameStatus = `🤝 Permainan berakhir seri!`;
        } else {
            gameStatus = `🎲 Giliran: @${room.game.currentTurn.split('@')[0]} (${senderId === room.game.playerX ? '❎' : '⭕'})`;
        }

        const str = `
🎮 *TicTacToe*

${gameStatus}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

▢ Pemain ❎: @${room.game.playerX.split('@')[0]}
▢ Pemain ⭕: @${room.game.playerO.split('@')[0]}

${!winner && !isTie ? '• Ketik angka (1–9) untuk melangkah\n• Ketik *surrender* untuk menyerah' : ''}
`;

        const mentions = [
            room.game.playerX,
            room.game.playerO,
            ...(winner ? [winner] : [room.game.currentTurn])
        ];

        await sock.sendMessage(room.x, {
            text: str,
            mentions: mentions
        });

        if (room.x !== room.o) {
            await sock.sendMessage(room.o, {
                text: str,
                mentions: mentions
            });
        }

        if (winner || isTie) {
            delete games[room.id];
        }

    } catch (error) {
        console.error('Error in tictactoe move:', error);
    }
}

module.exports = {
    tictactoeCommand,
    handleTicTacToeMove
};
