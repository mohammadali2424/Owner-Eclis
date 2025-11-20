const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = 'YOUR_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

const OWNER_ID = '7495437597';
const TARGET_GROUP_ID = '-1002483328877';

let messageQueue = [];

function isOwner(userId) {
    return userId.toString() === OWNER_ID.toString();
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isOwner(userId)) {
        bot.sendMessage(chatId, '🚫 دسترسی denied!');
        return;
    }

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📤 ارسال به گروه', callback_data: 'send_messages' }],
                [{ text: '🗑 پاک کردن همه', callback_data: 'clear_messages' }]
            ]
        }
    };

    bot.sendMessage(chatId, `تعداد پیام‌های ذخیره شده: ${messageQueue.length}`, keyboard);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (!isOwner(userId)) {
        bot.answerCallbackQuery(query.id, { text: 'دسترسی denied!' });
        return;
    }

    if (query.data === 'send_messages') {
        sendAllMessages(chatId);
    } else if (query.data === 'clear_messages') {
        messageQueue = [];
        bot.answerCallbackQuery(query.id, { text: 'همه پیام‌ها پاک شد!' });
    }
});

async function sendAllMessages(chatId) {
    if (messageQueue.length === 0) {
        bot.sendMessage(chatId, '❌ هیچ پیامی برای ارسال ندارید!');
        return;
    }

    try {
        for (const item of messageQueue) {
            switch (item.type) {
                case 'text':
                    await bot.sendMessage(TARGET_GROUP_ID, item.content);
                    break;
                case 'photo':
                    await bot.sendPhoto(TARGET_GROUP_ID, item.file_id, {
                        caption: item.caption
                    });
                    break;
                case 'video':
                    await bot.sendVideo(TARGET_GROUP_ID, item.file_id, {
                        caption: item.caption
                    });
                    break;
                case 'sticker':
                    await bot.sendSticker(TARGET_GROUP_ID, item.file_id);
                    break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        bot.sendMessage(chatId, `✅ ${messageQueue.length} پیام با موفقیت ارسال شد!`);
        messageQueue = [];
    } catch (error) {
        console.error('خطا در ارسال:', error);
        bot.sendMessage(chatId, '❌ خطا در ارسال پیام‌ها!');
    }
}

app.get('/', (req, res) => {
    res.send('🤖 Bot is running!');
});

app.listen(port, () => {
    console.log(`سرور روی پورت ${port} فعال شد`);
});
