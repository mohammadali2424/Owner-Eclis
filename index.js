const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================[ تنظیمات ]==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ متغیرهای محیطی ضروری وجود ندارند');
  console.log('BOT_TOKEN:', !!BOT_TOKEN);
  console.log('SUPABASE_URL:', !!SUPABASE_URL);
  console.log('SUPABASE_KEY:', !!SUPABASE_KEY);
  process.exit(1);
}

// راه‌اندازی سرویس‌ها
try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const bot = new Telegraf(BOT_TOKEN);

  app.use(express.json());

  // ==================[ مدیریت خطاها ]==================
  bot.catch((err, ctx) => {
    console.log('❌ خطا در ربات:', err);
  });

  // ==================[ میدلور لاگ‌گیری ]==================
  bot.use(async (ctx, next) => {
    console.log('📨 دریافت update:', ctx.updateType, 'از کاربر:', ctx.from?.id);
    try {
      await next();
    } catch (error) {
      console.log('❌ خطا در پردازش:', error.message);
    }
  });

  // ==================[ بررسی مالکیت ]==================
  const isOwner = (userId) => {
    return userId === OWNER_ID;
  };

  // ==================[ دستورات اصلی ]==================
  bot.start(async (ctx) => {
    try {
      console.log('🚀 دستور /start دریافت شد از:', ctx.from.id);
      
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز /help برای راهنما استفاده کنید');
      console.log('✅ پاسخ /start ارسال شد');
    } catch (error) {
      console.log('❌ خطا در دستور start:', error.message);
    }
  });

  bot.command('help', async (ctx) => {
    try {
      console.log('📖 دستور /help دریافت شد از:', ctx.from.id);
      
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      const helpText = `🥷🏻 راهنمای ربات مدیریت Eclis

📋 دستورات:
/start - شروع ربات
/help - راهنما
/status - وضعیت ربات
/groups - لیست گروه‌ها
/بررسی_وفاداری - بررسی وفاداری اعضا
/setsticker - تنظیم استیکر
/stickerlist - لیست استیکرها

💡 ربات آماده خدمت‌رسانی است`;

      await ctx.reply(helpText);
      console.log('✅ پاسخ /help ارسال شد');
    } catch (error) {
      console.log('❌ خطا در دستور help:', error.message);
    }
  });

  bot.command('status', async (ctx) => {
    try {
      console.log('📊 دستور /status دریافت شد از:', ctx.from.id);
      
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }
      
      const message = `🤖 وضعیت ربات مدیریت Eclis

📊 آمار:
• زمان فعالیت: ${Math.round(process.uptime() / 60)} دقیقه
• حافظه استفاده شده: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB

✅ ربات در حال اجرا است`;

      await ctx.reply(message);
      console.log('✅ پاسخ /status ارسال شد');
    } catch (error) {
      console.log('❌ خطا در دستور status:', error.message);
    }
  });

  bot.command('test', async (ctx) => {
    try {
      console.log('🧪 دستور /test دریافت شد از:', ctx.from.id);
      await ctx.reply('✅ ربات پاسخ می‌دهد! همه چیز درست کار می‌کند.');
      console.log('✅ پاسخ /test ارسال شد');
    } catch (error) {
      console.log('❌ خطا در دستور test:', error.message);
    }
  });

  // ==================[ دستور مدیریت استیکر ]==================
  bot.command('setsticker', async (ctx) => {
    try {
      console.log('🎭 دستور /setsticker دریافت شد از:', ctx.from.id);
      
      if (!isOwner(ctx.from.id)) {
        await ctx.reply('من فقط از اربابم پیروی میکنم 🥷🏻');
        return;
      }

      await ctx.reply('💡 این دستور در حال حاضر در دست توسعه است');
      console.log('✅ پاسخ /setsticker ارسال شد');
    } catch (error) {
      console.log('❌ خطا در دستور setsticker:', error.message);
    }
  });

  // ==================[ هندلر برای پیام‌های متنی ]==================
  bot.on('text', async (ctx) => {
    try {
      console.log('📝 پیام متنی دریافت شد:', ctx.message.text?.substring(0, 50));
      
      // فقط به مالک پاسخ بده
      if (isOwner(ctx.from.id)) {
        await ctx.reply('✅ پیام شما دریافت شد. از دستور /help برای راهنما استفاده کنید.');
      }
    } catch (error) {
      console.log('❌ خطا در پردازش پیام متنی:', error.message);
    }
  });

  // ==================[ راه‌اندازی ربات ]==================
  const startBot = async () => {
    try {
      console.log('🤖 شروع راه‌اندازی ربات...');
      
      // تست اتصال به تلگرام
      const botInfo = await bot.telegram.getMe();
      console.log('✅ ربات شناسایی شد:', botInfo.first_name, `(@${botInfo.username})`);
      
      // تست اتصال به Supabase
      const { data, error } = await supabase.from('eclis_members').select('count').limit(1);
      if (error) {
        console.log('⚠️ خطا در اتصال به Supabase:', error.message);
      } else {
        console.log('✅ اتصال به Supabase برقرار شد');
      }
      
      // راه‌اندازی ربات
      await bot.launch({
        dropPendingUpdates: true,
        polling: {
          timeout: 30,
          limit: 100,
          allowed_updates: ['message', 'callback_query', 'my_chat_member']
        }
      });
      
      console.log('✅ ربات با موفقیت فعال شد و در حال گوش دادن است...');
      
      // اطلاع به مالک
      try {
        await bot.telegram.sendMessage(
          OWNER_ID, 
          `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
          `✅ ربات آماده دریافت دستورات است\n` +
          `💡 از /help برای راهنما استفاده کنید\n` +
          `🧪 از /test برای تست ربات استفاده کنید`
        );
        console.log('✅ پیام فعال شدن به مالک ارسال شد');
      } catch (error) {
        console.log('⚠️ نتوانستم به مالک اطلاع دهم:', error.message);
      }
      
    } catch (error) {
      console.log('❌ خطا در راه‌اندازی ربات:', error.message);
      process.exit(1);
    }
  };

  // ==================[ سرور اکسپرس ]==================
  app.get('/', (req, res) => {
    res.json({ 
      status: '✅ ربات فعال است',
      bot: 'Eclis Manager',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()) + ' ثانیه'
    });
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString() 
    });
  });

  // راه‌اندازی سرور و ربات
  app.listen(PORT, () => {
    console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
    startBot();
  });

  // مدیریت خروج تمیز
  process.once('SIGINT', () => {
    console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
    bot.stop('SIGINT');
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
    bot.stop('SIGTERM');
    process.exit(0);
  });

} catch (error) {
  console.log('❌ خطا در راه‌اندازی اولیه:', error.message);
  process.exit(1);
                  }
