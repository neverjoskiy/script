// === МУЗЫКАЛЬНЫЙ БОТ ДЛЯ RAILWAY.APP ===
// Автозапуск, защита от сна, работает 24/7

const { Client, GatewayIntentBits } = require('discord.js');
const {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    NoSubscriberBehavior
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const http = require('http');

// Создаём клиента
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Хранилище очереди
const queue = new Map();

// Бот готов
client.once('clientReady', () => {
    console.log(`✅ Бот ${client.user.tag} готов! Работает на Railway.`);
});

// Обработка сообщений
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const { channel: voiceChannel } = message.member.voice;
    const guildId = message.guild.id;

    // Команда: play / p
    if (command === 'play' || command === 'p') {
        if (!voiceChannel) return message.reply('🔊 Сначала подключись к голосовому каналу!');
        if (!args.length) return message.reply('🎵 Укажи название или ссылку!');

        const search = args.join(' ');
        const songInfo = await ytSearch(search);
        const video = songInfo.videos[0];
        if (!video) return message.reply('❌ Ничего не найдено.');

        const song = { title: video.title, url: video.url };

        const serverQueue = queue.get(guildId) || {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } }),
            songs: [],
            playing: true
        };

        serverQueue.songs.push(song);
        queue.set(guildId, serverQueue);

        if (!serverQueue.connection) {
            try {
                serverQueue.connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                });
                serverQueue.connection.subscribe(serverQueue.player);
                play(guildId, serverQueue.songs[0]);
            } catch (err) {
                console.error('❌ Ошибка подключения:', err);
                queue.delete(guildId);
                return message.reply('❌ Не удалось подключиться к голосовому каналу.');
            }
        } else {
            message.channel.send(`🎶 Добавлено в очередь: **${song.title}**`);
        }
    }

    // Остальные команды: skip, stop, pause, resume, queue
    if (command === 'skip') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue) return message.reply('❌ Нет активной очереди.');
        serverQueue.player.stop();
        message.channel.send('⏭ Пропущено!');
    }

    if (command === 'stop') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue) return message.reply('❌ Нет активной очереди.');
        serverQueue.songs = [];
        serverQueue.player.stop();
        message.channel.send('⏹ Остановлено и очередь очищена.');
    }

    if (command === 'pause') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue) return message.reply('❌ Ничего не играет.');
        serverQueue.player.pause();
        message.channel.send('⏸ Пауза.');
    }

    if (command === 'resume') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue) return message.reply('❌ Ничего не приостановлено.');
        serverQueue.player.unpause();
        message.channel.send('▶️ Продолжаем!');
    }

    if (command === 'queue') {
        const serverQueue = queue.get(guildId);
        if (!serverQueue || serverQueue.songs.length === 0) {
            return message.channel.send('📋 Очередь пуста.');
        }
        const list = serverQueue.songs.map((s, i) => `**${i + 1}.** ${s.title}`).join('\n');
        message.channel.send(`📋 Очередь (${serverQueue.songs.length}):\n${list}`);
    }
});

// Функция проигрывания
function play(guildId, song) {
    const serverQueue = queue.get(guildId);
    if (!serverQueue) return;

    if (!song) {
        serverQueue.connection.destroy();
        queue.delete(guildId);
        serverQueue.textChannel.send('⏹ Очередь закончилась.');
        return;
    }

    console.log('🎵 Начинаю проигрывание:', song.title);

    const stream = ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio' });
    const resource = createAudioResource(stream);
    serverQueue.player.play(resource);

    serverQueue.textChannel.send(`▶️ Сейчас играет: **${song.title}**`);

    serverQueue.player.on('stateChange', (oldState, newState) => {
        if (newState.status === 'idle') {
            serverQueue.songs.shift();
            play(guildId, serverQueue.songs[0]);
        }
    });
}

// 🔁 HTTP-сервер для "пробуждения" бота (чтобы не спал на Railway)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Музыкальный бот работает! Подключено к ${client.guilds.cache.size} серверам.`);
});

server.listen(PORT, () => {
    console.log(`🌐 HTTP-сервер запущен на порту ${PORT}`);
});

// 🚀 Запуск бота
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
    console.error('❌ ОШИБКА: Токен не найден! Установи переменную TOKEN в настройках Railway.');
    process.exit(1);
}

client.login(TOKEN);