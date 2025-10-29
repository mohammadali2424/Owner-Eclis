const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================[ تنظیمات ]==================
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';
const RENDER_URL = process.env.RENDER_URL || '';

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN وجود ندارد');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('⚠️ تنظیمات Supabase وجود ندارد - برخی قابلیت‌ها غیرفعال خواهند بود');
}

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ سیستم پینگ خودکار ]==================
const startPingService = () => {
  if (RENDER_URL) {
    console.log('🔄 راه‌اندازی سیستم پینگ خودکار...');
    
    setInterval(async () => {
      try {
        const response = await axios.get(`${RENDER_URL}/health`);
        console.log('✅ پینگ موفق:', new Date().toLocaleTimeString('fa-IR'));
      } catch (error) {
        console.log('❌ خطا در پینگ:', error.message);
      }
    }, 13 * 60 * 1000);

    setTimeout(async () => {
      try {
        await axios.get(`${RENDER_URL}/health`);
        console.log('✅ اولین پینگ ارسال شد');
      } catch (error) {
        console.log('❌ خطا در اولین پینگ:', error.message);
      }
    }, 5000);
  } else {
    console.log('⚠️ آدرس RENDER_URL تنظیم نشده - پینگ غیرفعال');
  }
};

// ==================[ سیستم لاگ‌گیری ساده ]==================
const logActivity = async (type, details, userId = null, chatId = null) => {
  if (!supabase) return;
  
  try {
    await supabase
      .from('Eclis_activity_logs')
      .insert({
        activity_type: type,
        details: details,
        user_id: userId,
        chat_id: chatId,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.log('❌ خطا در لاگ فعالیت:', error.message);
  }
};

// ==================[ مدیریت خطاها ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
});

// ==================[ میدلور مدیریت خطاهای عمومی ]==================
bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error.message);
    
    if (ctx.from && ctx.from.id === OWNER_ID) {
      try {
        await ctx.reply(`❌ خطا در پردازش دستور:\n${error.message.substring(0, 1000)}`, {
          reply_to_message_id: ctx.message?.message_id
        });
      } catch (replyError) {
        console.log('❌ خطا در ارسال پیام خطا:', replyError.message);
      }
    }
  }
});

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return { hasAccess: false, message: 'کاربر شناسایی نشد' };
  }
  
  const owners = [OWNER_ID];
  if (!owners.includes(userId)) {
    return { hasAccess: false, message: 'من فقط از اربابم پیروی میکنم 🥷🏻' };
  }
  
  return { hasAccess: true };
};

// ==================[ بررسی نمادهای وفاداری ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined' || text === '') {
    return false;
  }
  
  const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
  const textStr = String(text).normalize();
  
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      return true;
    }
  }
  
  return false;
};

// ==================[ دستورات اصلی - ساده شده ]==================

// دستور start
bot.start(async (ctx) => {
  try {
    console.log('🚀 دستور /start دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز /help برای راهنما استفاده کنید');
    console.log('✅ پاسخ /start ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور start:', error.message);
  }
});

// دستور help
bot.command('help', async (ctx) => {
  try {
    console.log('ℹ️ دستور /help دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    const helpText = `🥷🏻 راهنمای ربات مدیریت Eclis

📋 دستورات:
/start - شروع ربات
/help - راهنما
/status - وضعیت ربات
/groups - لیست گروه‌ها
/update_chats - بروزرسانی چت‌ها
/بررسی_وفاداری - بررسی وفاداری اعضا

💡 ربات آماده خدمت‌رسانی است`;

    await ctx.reply(helpText);
    console.log('✅ پاسخ /help ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور help:', error.message);
  }
});

// دستور status
bot.command('status', async (ctx) => {
  try {
    console.log('📊 دستور /status دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    const message = `🤖 وضعیت ربات مدیریت Eclis

✅ ربات فعال و در حال اجرا است
⏰ زمان: ${new Date().toLocaleString('fa-IR')}
🆔 مالک: ${OWNER_ID}
📊 گروه اصلی: ${MAIN_GROUP_ID || 'تنظیم نشده'}`;

    await ctx.reply(message);
    console.log('✅ پاسخ /status ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور status:', error.message);
  }
});

// دستور groups
bot.command('groups', async (ctx) => {
  try {
    console.log('🏘️ دستور /groups دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    await ctx.reply('📭 در حال حاضر لیست گروه‌ها در حال توسعه است...');
    console.log('✅ پاسخ /groups ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور groups:', error.message);
  }
});

// دستور update_chats
bot.command('update_chats', async (ctx) => {
  try {
    console.log('🔄 دستور /update_chats دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    await ctx.reply('🔄 سیستم بروزرسانی چت‌ها در حال توسعه است...');
    console.log('✅ پاسخ /update_chats ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور update_chats:', error.message);
  }
});

// دستور بررسی وفاداری
bot.command('بررسی_وفاداری', async (ctx) => {
  try {
    console.log('🎯 دستور /بررسی_وفاداری دریافت شد از کاربر:', ctx.from.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    await ctx.reply('🔍 سیستم بررسی وفاداری در حال توسعه است...');
    console.log('✅ پاسخ /بررسی_وفاداری ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور بررسی_وفاداری:', error.message);
  }
});

// هندلر برای تست ساده
bot.hears('test', async (ctx) => {
  try {
    console.log('🧪 تست دریافت شد از کاربر:', ctx.from.id);
    await ctx.reply('✅ ربات فعال است! تست موفقیت‌آمیز بود.');
    console.log('✅ پاسخ تست ارسال شد');
  } catch (error) {
    console.log('❌ خطا در تست:', error.message);
  }
});

// هندلر برای همه پیام‌ها (دیباگ)
bot.on('message', async (ctx) => {
  try {
    console.log('📨 پیام دریافت شد:', {
      from: ctx.from.id,
      text: ctx.message.text,
      chat: ctx.chat.id
    });
  } catch (error) {
    console.log('❌ خطا در پردازش پیام:', error.message);
  }
});

// ==================[ راه‌اندازی ربات ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // بررسی وضعیت ربات
    const botInfo = await bot.telegram.getMe();
    console.log('✅ ربات شناسایی شد:', botInfo.first_name, `(@${botInfo.username})`);
    
    // راه‌اندازی ربات
    await bot.launch({
      dropPendingUpdates: true,
      polling: {
        timeout: 30,
        limit: 100
      }
    });
    
    console.log('✅ ربات با موفقیت فعال شد');
    console.log('📝 ربات آماده دریافت دستورات است...');
    
    // اطلاع به مالک
    try {
      await bot.telegram.sendMessage(
        OWNER_ID, 
        `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
        `⏰ زمان: ${new Date().toLocaleString('fa-IR')}\n` +
        `🆔 ID: ${botInfo.id}\n` +
        `👤 یوزرنیم: @${botInfo.username}\n\n` +
        `✅ ربات آماده دریافت دستورات است\n` +
        `💡 از /help برای راهنما استفاده کنید`
      );
      console.log('✅ اطلاع به مالک ارسال شد');
    } catch (error) {
      console.log('⚠️ نتوانستم به مالک اطلاع دهم:', error.message);
    }
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    
    // بررسی خطاهای رایج
    if (error.message.includes('ETELEGRAM')) {
      console.log('🔍 مشکل: توکن ربات نامعتبر است');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('🔍 مشکل: اتصال به تلگرام برقرار نیست');
    } else {
      console.log('🔍 مشکل ناشناخته - لطفاً تنظیمات را بررسی کنید');
    }
    
    process.exit(1);
  }
};

// ==================[ سرور اکسپرس برای سلامت ]==================
app.get('/', (req, res) => {
  res.json({ 
    status: '✅ ربات فعال است',
    service: 'Eclis Management Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'Eclis Management Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/ping', (req, res) => {
  res.json({ 
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

// ==================[ راه‌اندازی سرور ]==================
app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  console.log('🔧 در حال راه‌اندازی ربات...');
  
  // راه‌اندازی ربات
  startBot();
  
  // راه‌اندازی سیستم پینگ خودکار
  startPingService();
});

// ==================[ مدیریت خاموشی ]==================
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
