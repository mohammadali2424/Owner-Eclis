const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
app.use(express.json());

// دریافت توکن از متغیر محیطی
const token = process.env.BOT_TOKEN;
if (!token) {
    console.error('❌ BOT_TOKEN تنظیم نشده است!');
    process.exit(1);
}

// ایجاد ربات - ابتدا بدون webhook
const bot = new TelegramBot(token);

// ذخیره پیام‌ها
let messageQueue = [];

// اطلاعات مالک و گروه
const OWNER_ID = process.env.OWNER_ID;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

// بررسی مالک
function isOwner(userId) {
    return userId && userId.toString() === OWNER_ID;
}

// راه‌اندازی Webhook بعد از اجرای سرور
async function setupBot() {
    try {
        const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${token}`;
        console.log(`🌐 تنظیم Webhook: ${webhookUrl}`);
        
        await bot.setWebHook(webhookUrl);
        console.log('✅ Webhook تنظیم شد');
        
        // دریافت اطلاعات ربات
        const botInfo = await bot.getMe();
        console.log(`🤖 ربات ${botInfo.first_name} فعال است`);
        
    } catch (error) {
        console.error('❌ خطا در تنظیم Webhook:', error.message);
    }
}

// مسیر Webhook
app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// مسیر اصلی برای سلامت‌سنجی
app.get('/', (req, res) => {
    res.json({ 
        status: '✅ ربات فعال است',
        queue_length: messageQueue.length,
        timestamp: new Date().toISOString()
    });
});

// مدیریت دستور /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (!isOwner(userId)) {
        await bot.sendMessage(chatId, '🚫 دسترسی denied!');
        return;
    }

    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📤 ارسال به گروه', callback_data: 'send_messages' }],
                [{ text: '🗑 پاک کردن', callback_data: 'clear_messages' }],
                [{ text: '📊 وضعیت', callback_data: 'status' }]
            ]
        }
    };

    await bot.sendMessage(chatId, 
        `🤖 ربات آماده است!\n\n` +
        `📝 پیام‌های ذخیره شده: ${messageQueue.length}\n` +
        `👤 مالک: ${OWNER_ID}\n` +
        `🎯 گروه هدف: ${TARGET_GROUP_ID}`,
        keyboard
    );
});

// مدیریت کلیک دکمه‌ها
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id.toString();

    if (!isOwner(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '🚫 دسترسی denied!' });
        return;
    }

    try {
        switch (query.data) {
            case 'send_messages':
                await sendAllMessages(chatId);
                break;
            case 'clear_messages':
                messageQueue = [];
                await bot.answerCallbackQuery(query.id, { text: '✅ پیام‌ها پاک شد' });
                await bot.sendMessage(chatId, '✅ همه پیام‌ها پاک شدند');
                break;
            case 'status':
                await bot.answerCallbackQuery(query.id, { 
                    text: `📊 ${messageQueue.length} پیام ذخیره شده` 
                });
                break;
        }
    } catch (error) {
        console.error('خطا در callback:', error);
        await bot.answerCallbackQuery(query.id, { text: '❌ خطا در پردازش' });
    }
});

// دریافت پیام‌ها
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (!isOwner(userId)) {
        await bot.sendMessage(chatId, '🚫 دسترسی denied!');
        return;
    }

    try {
        // ذخیره متن
        if (msg.text) {
            messageQueue.push({
                type: 'text',
                content: msg.text,
                timestamp: new Date().toISOString()
            });
            await bot.sendMessage(chatId, '✅ متن ذخیره شد');
        }
        
        // ذخیره عکس
        else if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            messageQueue.push({
                type: 'photo',
                file_id: photo.file_id,
                caption: msg.caption || ''
            });
            await bot.sendMessage(chatId, '✅ عکس ذخیره شد');
        }
        
        // ذخیره استیکر
        else if (msg.sticker) {
            messageQueue.push({
                type: 'sticker',
                file_id: msg.sticker.file_id
            });
            await bot.sendMessage(chatId, '✅ استیکر ذخیره شد');
        }
        
        // ذخیره فیلم
        else if (msg.video) {
            messageQueue.push({
                type: 'video',
                file_id: msg.video.file_id,
                caption: msg.caption || ''
            });
            await bot.sendMessage(chatId, '✅ فیلم ذخیره شد');
        }

    } catch (error) {
        console.error('خطا در ذخیره پیام:', error);
        await bot.sendMessage(chatId, '❌ خطا در ذخیره پیام');
    }
});

// ارسال به گروه
async function sendAllMessages(chatId) {
    if (messageQueue.length === 0) {
        await bot.sendMessage(chatId, '❌ هیچ پیامی برای ارسال ندارید!');
        return;
    }

    try {
        let sentCount = 0;
        
        for (const item of messageQueue) {
            try {
                switch (item.type) {
                    case 'text':
                        await bot.sendMessage(TARGET_GROUP_ID, item.content);
                        break;
                    case 'photo':
                        await bot.sendPhoto(TARGET_GROUP_ID, item.file_id, {
                            caption: item.caption
                        });
                        break;
                    case 'sticker':
                        await bot.sendSticker(TARGET_GROUP_ID, item.file_id);
                        break;
                    case 'video':
                        await bot.sendVideo(TARGET_GROUP_ID, item.file_id, {
                            caption: item.caption
                        });
                        break;
                }
                sentCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`خطا در ارسال آیتم:`, error.message);
            }
        }

        await bot.sendMessage(chatId, 
            `✅ ارسال کامل شد!\n` +
            `📤 ${sentCount} از ${messageQueue.length} پیام ارسال شد`
        );
        
        messageQueue = [];
        
    } catch (error) {
        console.error('خطا در ارسال:', error);
        await bot.sendMessage(chatId, '❌ خطا در ارسال پیام‌ها!');
    }
}

// مدیریت خطا
bot.on('error', (error) => {
    console.log('🤖 خطای ربات:', error.message);
});

bot.on('polling_error', (error) => {
    console.log('📡 خطای polling:', error.message);
});

// شروع سرور
const port = process.env.PORT || 3000;
app.listen(port, async () => {
    console.log(`🚀 سرور فعال روی پورت ${port}`);
    await setupBot();
});
