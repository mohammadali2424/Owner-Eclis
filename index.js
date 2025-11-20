const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const OWNER_ID = process.env.OWNER_ID || 'YOUR_OWNER_USER_ID';
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || 'YOUR_TARGET_GROUP_ID';

const app = express();
const port = process.env.PORT || 3000;

// ایجاد ربات با webhook
const bot = new TelegramBot(token);

// این قسمت حیاتی است - تنظیم webhook برای Render
const webhookUrl = `https://${process.env.RENDER_SERVICE_NAME || 'your-app-name'}.onrender.com/bot${token}`;
bot.setWebHook(webhookUrl);

// middleware برای parse کردن JSON
app.use(express.json());

// مسیر webhook برای دریافت update از تلگرام
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// مسیر اصلی برای چک کردن سلامت سرویس
app.get('/', (req, res) => {
  res.send('🤖 ربات فعال است!');
});

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
        [{ text: '🗑 پاک کردن همه', callback_data: 'clear_messages' }],
        [{ text: '📊 وضعیت', callback_data: 'status' }]
      ]
    }
  };

  bot.sendMessage(chatId, 
    `🤖 ربات فعال\n\n` +
    `📝 تعداد پیام‌های ذخیره شده: ${messageQueue.length}\n` +
    `🎯 گروه هدف: ${TARGET_GROUP_ID}`,
    keyboard
  );
});

// مدیریت callback
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (!isOwner(userId)) {
    await bot.answerCallbackQuery(query.id, { text: 'دسترسی denied!' });
    return;
  }

  try {
    if (query.data === 'send_messages') {
      await sendAllMessages(chatId);
    } else if (query.data === 'clear_messages') {
      messageQueue = [];
      await bot.answerCallbackQuery(query.id, { text: 'همه پیام‌ها پاک شد!' });
      await bot.sendMessage(chatId, '✅ همه پیام‌ها پاک شدند');
    } else if (query.data === 'status') {
      await bot.answerCallbackQuery(query.id, { 
        text: `تعداد پیام: ${messageQueue.length}` 
      });
    }
  } catch (error) {
    console.error('خطا در callback:', error);
    await bot.answerCallbackQuery(query.id, { text: 'خطا در پردازش!' });
  }
});

// دریافت همه انواع پیام
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    if (msg.chat.type === 'private') {
      await bot.sendMessage(chatId, '🚫 دسترسی denied!');
    }
    return;
  }

  // نادیده گرفتن دستورات
  if (msg.text && msg.text.startsWith('/')) {
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
        caption: msg.caption || '',
        timestamp: new Date().toISOString()
      });
      await bot.sendMessage(chatId, '✅ عکس ذخیره شد');
    }
    // ذخیره فیلم
    else if (msg.video) {
      messageQueue.push({
        type: 'video',
        file_id: msg.video.file_id,
        caption: msg.caption || '',
        timestamp: new Date().toISOString()
      });
      await bot.sendMessage(chatId, '✅ فیلم ذخیره شد');
    }
    // ذخیره استیکر
    else if (msg.sticker) {
      messageQueue.push({
        type: 'sticker',
        file_id: msg.sticker.file_id,
        timestamp: new Date().toISOString()
      });
      await bot.sendMessage(chatId, '✅ استیکر ذخیره شد');
    }
    // ذخیره گیف
    else if (msg.animation) {
      messageQueue.push({
        type: 'animation',
        file_id: msg.animation.file_id,
        caption: msg.caption || '',
        timestamp: new Date().toISOString()
      });
      await bot.sendMessage(chatId, '✅ گیف ذخیره شد');
    }
    // ذخیره فایل
    else if (msg.document) {
      messageQueue.push({
        type: 'document',
        file_id: msg.document.file_id,
        filename: msg.document.file_name,
        caption: msg.caption || '',
        timestamp: new Date().toISOString()
      });
      await bot.sendMessage(chatId, '✅ فایل ذخیره شد');
    }
  } catch (error) {
    console.error('خطا در ذخیره پیام:', error);
    await bot.sendMessage(chatId, '❌ خطا در ذخیره پیام!');
  }
});

// ارسال همه پیام‌ها به گروه
async function sendAllMessages(chatId) {
  if (messageQueue.length === 0) {
    await bot.sendMessage(chatId, '❌ هیچ پیامی برای ارسال ندارید!');
    return;
  }

  try {
    let successCount = 0;
    
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
          case 'video':
            await bot.sendVideo(TARGET_GROUP_ID, item.file_id, {
              caption: item.caption
            });
            break;
          case 'sticker':
            await bot.sendSticker(TARGET_GROUP_ID, item.file_id);
            break;
          case 'animation':
            await bot.sendAnimation(TARGET_GROUP_ID, item.file_id, {
              caption: item.caption
            });
            break;
          case 'document':
            await bot.sendDocument(TARGET_GROUP_ID, item.file_id, {
              caption: item.caption
            });
            break;
        }
        successCount++;
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`خطا در ارسال آیتم:`, error);
      }
    }

    await bot.sendMessage(chatId, 
      `✅ ارسال کامل شد!\n` +
      `📤 ${successCount} از ${messageQueue.length} پیام با موفقیت ارسال شد`
    );
    
    // پاک کردن صف پس از ارسال موفق
    messageQueue = [];
    
  } catch (error) {
    console.error('خطا در ارسال:', error);
    await bot.sendMessage(chatId, '❌ خطا در ارسال پیام‌ها!');
  }
}

// مدیریت خطاهای ربات
bot.on('error', (error) => {
  console.error('خطای ربات:', error);
});

// راه‌اندازی سرور
app.listen(port, () => {
  console.log(`✅ ربات فعال شد روی پورت ${port}`);
  console.log(`🌐 Webhook URL: ${webhookUrl}`);
  console.log(`🎯 گروه هدف: ${TARGET_GROUP_ID}`);
});
