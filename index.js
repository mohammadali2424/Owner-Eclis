const TelegramBot = require('node-telegram-bot-api');

const token = 'YOUR_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

// آیدی گروه مورد نظر - جایگزین کن
const TARGET_GROUP_ID = '-1002483328877';

// آیدی مالک - جایگزین کن
const OWNER_ID = '7495437597';

// ذخیره موقت پیام‌ها
let messageQueue = [];

// بررسی مالک
function isOwner(userId) {
    return userId.toString() === OWNER_ID.toString();
}

// مدیریت دستور /start
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

    bot.sendMessage(chatId, 
        `📝 هر پیامی می‌فرستی ذخیره میشه (متن، عکس، فیلم، استیکر، فایل)\n\n` +
        `تعداد پیام‌های ذخیره شده: ${messageQueue.length}\n\n` +
        `وقتی آماده بودی روی "ارسال به گروه" کلیک کن`,
        keyboard
    );
});

// مدیریت callback
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
        bot.sendMessage(chatId, '✅ همه پیام‌ها پاک شدند');
    }
});

// دریافت همه انواع پیام
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // فقط مالک می‌تواند پیام بفرستد
    if (!isOwner(userId)) {
        if (msg.chat.type === 'private') {
            bot.sendMessage(chatId, '🚫 دسترسی denied!');
        }
        return;
    }

    // نادیده گرفتن دستور /start
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    // ذخیره متن
    if (msg.text) {
        messageQueue.push({
            type: 'text',
            content: msg.text
        });
        bot.sendMessage(chatId, '✅ متن ذخیره شد');
    }
    // ذخیره عکس
    else if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        messageQueue.push({
            type: 'photo',
            file_id: photo.file_id,
            caption: msg.caption || ''
        });
        bot.sendMessage(chatId, '✅ عکس ذخیره شد');
    }
    // ذخیره فیلم
    else if (msg.video) {
        messageQueue.push({
            type: 'video',
            file_id: msg.video.file_id,
            caption: msg.caption || ''
        });
        bot.sendMessage(chatId, '✅ فیلم ذخیره شد');
    }
    // ذخیره استیکر
    else if (msg.sticker) {
        messageQueue.push({
            type: 'sticker',
            file_id: msg.sticker.file_id
        });
        bot.sendMessage(chatId, '✅ استیکر ذخیره شد');
    }
    // ذخیره فایل
    else if (msg.document) {
        messageQueue.push({
            type: 'document',
            file_id: msg.document.file_id,
            caption: msg.caption || ''
        });
        bot.sendMessage(chatId, '✅ فایل ذخیره شد');
    }
    // ذخیره گیف (انیمیشن)
    else if (msg.animation) {
        messageQueue.push({
            type: 'animation',
            file_id: msg.animation.file_id,
            caption: msg.caption || ''
        });
        bot.sendMessage(chatId, '✅ گیف ذخیره شد');
    }
});

// ارسال همه پیام‌ها به گروه
async function sendAllMessages(chatId) {
    if (messageQueue.length === 0) {
        bot.sendMessage(chatId, '❌ هیچ پیامی برای ارسال ندارید!');
        return;
    }

    try {
        // ارسال به گروه
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
                case 'document':
                    await bot.sendDocument(TARGET_GROUP_ID, item.file_id, {
                        caption: item.caption
                    });
                    break;
                case 'animation':
                    await bot.sendAnimation(TARGET_GROUP_ID, item.file_id, {
                        caption: item.caption
                    });
                    break;
            }
            
            // تاخیر کوتاه بین ارسال‌ها
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        bot.sendMessage(chatId, `✅ ${messageQueue.length} پیام با موفقیت ارسال شد!`);
        
        // پاک کردن صف پس از ارسال موفق
        messageQueue = [];

    } catch (error) {
        console.error('خطا در ارسال:', error);
        bot.sendMessage(chatId, '❌ خطا در ارسال پیام‌ها!');
    }
}

// راه‌اندازی سرور
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot is running!');
});

app.listen(port, () => {
    console.log(`✅ ربات فعال شد`);
    console.log(`🎯 گروه هدف: ${TARGET_GROUP_ID}`);
});
