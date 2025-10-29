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

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');
console.log('📋 بررسی متغیرهای محیطی...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN وجود ندارد');
  process.exit(1);
}

console.log('✅ BOT_TOKEN موجود است');

// ایجاد اتصال به Supabase (اگر تنظیمات موجود باشد)
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase متصل شد');
  } catch (error) {
    console.log('❌ خطا در اتصال به Supabase:', error.message);
    supabase = null;
  }
} else {
  console.log('⚠️ تنظیمات Supabase وجود ندارد - برخی قابلیت‌ها غیرفعال خواهند بود');
}

const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ سیستم استیکرهای پیشرفته ]==================
const stickerConfigs = {
  // استیکرهای اصلی
  'start_command': { description: 'زمان شروع ربات' },
  'help_command': { description: 'زمان ارسال راهنما' },
  'status_command': { description: 'زمان وضعیت ربات' },
  'groups_command': { description: 'زمان لیست گروه‌ها' },
  'update_chats_command': { description: 'زمان بروزرسانی چت‌ها' },
  'loyalty_scan_command': { description: 'زمان بررسی وفاداری' },
  'ban_suspicious': { description: 'زمان بن کردن مشکوک‌ها' },
  'dont_ban_suspicious': { description: 'زمان بن نکردن مشکوک‌ها' },
  'added_by_owner': { description: 'زمان اضافه شدن توسط مالک' },
  
  // استیکرهای کاربران جدید
  'new_user_question': { description: 'سوال برای کاربر جدید' },
  'user_approved': { description: 'تایید کاربر' },
  'user_rejected': { description: 'رد کاربر' },
  
  // استیکرهای اخطار
  'warning_1': { description: 'اخطار اول' },
  'warning_2': { description: 'اخطار دوم' },
  'warning_3': { description: 'اخطار سوم' }
};

const getSticker = async (stickerType) => {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('Eclis_stickers')
      .select('sticker_file_id, is_active')
      .eq('sticker_type', stickerType)
      .single();

    if (error || !data || !data.is_active) {
      return null;
    }

    return data.sticker_file_id;
  } catch (error) {
    console.log('❌ خطا در دریافت استیکر:', error.message);
    return null;
  }
};

const sendStickerIfExists = async (ctx, stickerType) => {
  try {
    const stickerId = await getSticker(stickerType);
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
      console.log(`🎭 استیکر ${stickerType} ارسال شد`);
      return true;
    }
    return false;
  } catch (error) {
    console.log(`❌ خطا در ارسال استیکر ${stickerType}:`, error.message);
    return false;
  }
};

const setSticker = async (stickerType, stickerFileId, isActive = true) => {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('Eclis_stickers')
      .upsert({
        sticker_type: stickerType,
        sticker_file_id: stickerFileId,
        is_active: isActive,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sticker_type' });

    if (error) {
      console.log('❌ خطا در ذخیره استیکر:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره استیکر:', error.message);
    return false;
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
        await ctx.reply(`❌ خطا در پردازش دستور:\n${error.message.substring(0, 1000)}`);
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

// ==================[ دستورات اصلی با استیکر ]==================

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
    
    // ارسال استیکر اگر وجود دارد
    await sendStickerIfExists(ctx, 'start_command');
    
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
/setsticker - تنظیم استیکر
/stickerlist - لیست استیکرها

💡 ربات آماده خدمت‌رسانی است`;

    await ctx.reply(helpText);
    
    // ارسال استیکر اگر وجود دارد
    await sendStickerIfExists(ctx, 'help_command');
    
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
    
    // ارسال استیکر اگر وجود دارد
    await sendStickerIfExists(ctx, 'status_command');
    
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
    
    // ارسال استیکر اگر وجود دارد
    await sendStickerIfExists(ctx, 'groups_command');
    
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
    
    // ارسال استیکر اگر وجود دارد
    await sendStickerIfExists(ctx, 'update_chats_command');
    
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
    
    // ارسال استیکر اگر وجود دارد
    await sendStickerIfExists(ctx, 'loyalty_scan_command');
    
    console.log('✅ پاسخ /بررسی_وفاداری ارسال شد');
  } catch (error) {
    console.log('❌ خطا در دستور بررسی_وفاداری:', error.message);
  }
});

// ==================[ دستورات مدیریت استیکر ]==================
bot.command('setsticker', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
      await ctx.reply(
        '💡 لطفاً یک استیکر را ریپلای کنید و دستور را به این صورت استفاده کنید:\n\n' +
        '`/setsticker <نوع_استیکر>`\n\n' +
        'مثال:\n' +
        '`/setsticker start_command`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      await ctx.reply(
        '💡 استفاده: `/setsticker <نوع_استیکر>`\n\n' +
        'برای مشاهده لیست کامل استیکرها از `/stickerlist` استفاده کنید.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const stickerType = args[1];
    const stickerFileId = ctx.message.reply_to_message.sticker.file_id;

    // بررسی معتبر بودن نوع استیکر
    if (!stickerConfigs[stickerType]) {
      await ctx.reply(
        '❌ نوع استیکر نامعتبر است.\n\n' +
        'از `/stickerlist` برای مشاهده انواع معتبر استفاده کنید.'
      );
      return;
    }

    const success = await setSticker(stickerType, stickerFileId);
    
    if (success) {
      await ctx.reply(`✅ استیکر برای "${stickerConfigs[stickerType].description}" با موفقیت تنظیم شد 🎭`);
      
      // تست استیکر
      await ctx.replyWithSticker(stickerFileId);
      await ctx.reply('📝 استیکر بالا ذخیره شد و از این پس بعد از این دستور نمایش داده می‌شود.');
    } else {
      await ctx.reply('❌ خطا در تنظیم استیکر. لطفاً بعداً تلاش کنید.');
    }

  } catch (error) {
    console.log('❌ خطا در تنظیم استیکر:', error.message);
    await ctx.reply('❌ خطا در تنظیم استیکر');
  }
});

// دستور لیست استیکرها
bot.command('stickerlist', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    let message = '🎭 لیست استیکرهای قابل تنظیم:\n\n';
    
    // گروه‌بندی استیکرها
    message += '**دستورات اصلی:**\n';
    for (const [key, config] of Object.entries(stickerConfigs)) {
      if (key.includes('_command') || ['start_command', 'help_command', 'status_command', 'groups_command', 'update_chats_command', 'loyalty_scan_command'].includes(key)) {
        const status = await getSticker(key) ? '✅ تنظیم شده' : '❌ تنظیم نشده';
        message += `• \`${key}\` - ${config.description} (${status})\n`;
      }
    }
    
    message += '\n**رویدادها:**\n';
    for (const [key, config] of Object.entries(stickerConfigs)) {
      if (!key.includes('_command') && !key.includes('warning_')) {
        const status = await getSticker(key) ? '✅ تنظیم شده' : '❌ تنظیم نشده';
        message += `• \`${key}\` - ${config.description} (${status})\n`;
      }
    }
    
    message += '\n**اخطارها:**\n';
    for (const [key, config] of Object.entries(stickerConfigs)) {
      if (key.includes('warning_')) {
        const status = await getSticker(key) ? '✅ تنظیم شده' : '❌ تنظیم نشده';
        message += `• \`${key}\` - ${config.description} (${status})\n`;
      }
    }
    
    message += '\n💡 برای تنظیم استیکر:\n`/setsticker نوع_استیکر`\n\nمثال:\n`/setsticker start_command`';

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.log('❌ خطا در نمایش لیست استیکرها:', error.message);
    await ctx.reply('❌ خطا در نمایش لیست استیکرها');
  }
});

// دستور حذف استیکر
bot.command('removesticker', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      await ctx.reply(
        '💡 استفاده: `/removesticker <نوع_استیکر>`\n\n' +
        'برای غیرفعال کردن استیکر استفاده کنید.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const stickerType = args[1];

    if (!stickerConfigs[stickerType]) {
      await ctx.reply('❌ نوع استیکر نامعتبر است.');
      return;
    }

    const success = await setSticker(stickerType, '', false);
    
    if (success) {
      await ctx.reply(`✅ استیکر "${stickerConfigs[stickerType].description}" غیرفعال شد`);
    } else {
      await ctx.reply('❌ خطا در غیرفعال کردن استیکر');
    }

  } catch (error) {
    console.log('❌ خطا در حذف استیکر:', error.message);
    await ctx.reply('❌ خطا در حذف استیکر');
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
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      console.log('📨 دستور دریافت شد:', {
        from: ctx.from.id,
        text: ctx.message.text,
        chat: ctx.chat.id
      });
    }
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
    console.log('🆔 ID ربات:', botInfo.id);
    
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
      console.log('🔍 مشکل ناشناخته:', error.message);
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

// هندل خطاهای catch نشده
process.on('uncaughtException', (error) => {
  console.log('❌ خطای catch نشده:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Promise رد شده catch نشده:', reason);
});
