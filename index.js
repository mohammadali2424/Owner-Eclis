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
const RENDER_URL = process.env.RENDER_URL || 'https://owner-eclis.onrender.com';

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN وجود ندارد');
  process.exit(1);
}

console.log('✅ BOT_TOKEN موجود است');

// ایجاد اتصال به Supabase
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase متصل شد');
    
    // ایجاد جداول اگر وجود ندارند
    await createTablesIfNotExist();
  } catch (error) {
    console.log('❌ خطا در اتصال به Supabase:', error.message);
    supabase = null;
  }
} else {
  console.log('⚠️ تنظیمات Supabase وجود ندارد');
}

const bot = new Telegraf(BOT_TOKEN);
app.use(express.json());

// ==================[ ایجاد جداول در Supabase ]==================
async function createTablesIfNotExist() {
  if (!supabase) return;
  
  try {
    console.log('🗄️ بررسی و ایجاد جداول در Supabase...');
    
    // جدول استیکرها
    const { error: stickersError } = await supabase
      .from('eclis_stickers')
      .select('*')
      .limit(1);
      
    if (stickersError && stickersError.code === 'PGRST204') {
      console.log('📋 ایجاد جدول استیکرها...');
      // جدول به صورت خودکار با اولین insert ایجاد می‌شود
    }
    
    // جدول اعضا
    const { error: membersError } = await supabase
      .from('eclis_members')
      .select('*')
      .limit(1);
      
    if (membersError && membersError.code === 'PGRST204') {
      console.log('📋 ایجاد جدول اعضا...');
    }
    
    console.log('✅ جداول بررسی شدند');
  } catch (error) {
    console.log('⚠️ خطا در بررسی جداول:', error.message);
  }
}

// ==================[ سیستم پینگ خودکار ]==================
const startPingService = () => {
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
};

// ==================[ سیستم استیکرهای هوشمند ]==================
const stickerConfigs = {
  // استیکرهای اصلی
  'start_command': { description: 'زمان شروع ربات', required: false },
  'help_command': { description: 'زمان ارسال راهنما', required: false },
  'status_command': { description: 'زمان وضعیت ربات', required: false },
  'groups_command': { description: 'زمان لیست گروه‌ها', required: false },
  'update_chats_command': { description: 'زمان بروزرسانی چت‌ها', required: false },
  'loyalty_scan_command': { description: 'زمان بررسی وفاداری', required: false },
  'ban_suspicious': { description: 'زمان بن کردن مشکوک‌ها', required: false },
  'dont_ban_suspicious': { description: 'زمان بن نکردن مشکوک‌ها', required: false },
  'added_by_owner': { description: 'زمان اضافه شدن توسط مالک', required: false },
  
  // استیکرهای کاربران جدید
  'new_user_question': { description: 'سوال برای کاربر جدید', required: false },
  'user_approved': { description: 'تایید کاربر', required: false },
  'user_rejected': { description: 'رد کاربر', required: false },
  
  // استیکرهای اخطار
  'warning_1': { description: 'اخطار اول', required: false },
  'warning_2': { description: 'اخطار دوم', required: false },
  'warning_3': { description: 'اخطار سوم', required: false }
};

const getSticker = async (stickerType) => {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('eclis_stickers')
      .select('sticker_file_id, is_active')
      .eq('sticker_type', stickerType)
      .single();

    if (error) {
      // اگر جدول وجود ندارد، null برگردان
      if (error.code === 'PGRST204' || error.code === 'PGRST205') {
        return null;
      }
      return null;
    }

    if (!data || !data.is_active) {
      return null;
    }

    return data.sticker_file_id;
  } catch (error) {
    console.log(`❌ خطا در دریافت استیکر ${stickerType}:`, error.message);
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
  if (!supabase) {
    console.log('❌ Supabase در دسترس نیست');
    return false;
  }
  
  try {
    const { error } = await supabase
      .from('eclis_stickers')
      .upsert({
        sticker_type: stickerType,
        sticker_file_id: stickerFileId,
        is_active: isActive,
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'sticker_type',
        ignoreDuplicates: false 
      });

    if (error) {
      console.log('❌ خطا در ذخیره استیکر:', error);
      return false;
    }
    
    console.log(`✅ استیکر ${stickerType} ذخیره شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره استیکر:', error.message);
    return false;
  }
};

// ==================[ سیستم اخطار خودکار ]==================
const startWarningSystem = () => {
  console.log('⚠️ راه‌اندازی سیستم اخطار خودکار...');
  
  setInterval(async () => {
    try {
      await checkAndWarnSuspiciousUsers();
    } catch (error) {
      console.log('❌ خطا در سیستم اخطار:', error.message);
    }
  }, 18 * 60 * 60 * 1000);
  
  setTimeout(() => {
    checkAndWarnSuspiciousUsers();
  }, 15000);
};

const checkAndWarnSuspiciousUsers = async () => {
  try {
    console.log('🔍 بررسی کاربران مشکوک برای اخطار...');
    
    if (!supabase) {
      console.log('⚠️ Supabase در دسترس نیست - سیستم اخطار غیرفعال');
      return;
    }
    
    // برای تست، از کاربران نمونه استفاده می‌کنیم
    const testUsers = [
      { user_id: 123456, first_name: 'کاربر تست ۱', warning_count: 0 },
      { user_id: 789012, first_name: 'کاربر تست ۲', warning_count: 1 }
    ];
    
    const usersByWarningCount = {
      warning1: [],
      warning2: [], 
      warning3: []
    };

    for (const user of testUsers) {
      const warningCount = user.warning_count || 0;
      
      if (warningCount === 0) {
        usersByWarningCount.warning1.push(user);
      } else if (warningCount === 1) {
        usersByWarningCount.warning2.push(user);
      } else if (warningCount >= 2) {
        usersByWarningCount.warning3.push(user);
      }
    }

    await sendWarningsToMainGroup(usersByWarningCount);
    console.log('✅ اخطارها ارسال شدند');

  } catch (error) {
    console.log('❌ خطا در بررسی کاربران مشکوک:', error.message);
  }
};

const sendWarningsToMainGroup = async (usersByWarningCount) => {
  try {
    if (!MAIN_GROUP_ID) {
      console.log('⚠️ MAIN_GROUP_ID تنظیم نشده - اخطارها ارسال نمی‌شوند');
      return;
    }

    // اخطار اول
    if (usersByWarningCount.warning1.length > 0) {
      const userMentions = usersByWarningCount.warning1
        .map(user => user.first_name || `کاربر ${user.user_id}`)
        .join(', ');
      
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID,
        `⚠️ ${userMentions}، فونت اسمتو درست کن`
      );
      console.log(`📢 اخطار اول ارسال شد برای: ${userMentions}`);
    }

    // اخطار دوم
    if (usersByWarningCount.warning2.length > 0) {
      const userMentions = usersByWarningCount.warning2
        .map(user => user.first_name || `کاربر ${user.user_id}`)
        .join(', ');
      
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID,
        `🚨 ${userMentions}، فرصت اخر برای درست کردن اسمتونه`
      );
      console.log(`📢 اخطار دوم ارسال شد برای: ${userMentions}`);
    }

    // اخطار سوم
    if (usersByWarningCount.warning3.length > 0) {
      const userMentions = usersByWarningCount.warning3
        .map(user => user.first_name || `کاربر ${user.user_id}`)
        .join(', ');
      
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID,
        `🔴 ${userMentions}، دیگه فرصتی برای دادن نیست`
      );
      console.log(`📢 اخطار سوم ارسال شد برای: ${userMentions}`);
    }

  } catch (error) {
    console.log('❌ خطا در ارسال اخطارها:', error.message);
  }
};

// ==================[ مدیریت خطاها ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
});

bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error.message);
    
    if (ctx.from && ctx.from.id === OWNER_ID) {
      try {
        await ctx.reply(`❌ خطا در پردازش دستور:\n${error.message}`);
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

// ==================[ دستورات اصلی با سیستم استیکر هوشمند ]==================

bot.start(async (ctx) => {
  try {
    console.log('🚀 دستور /start دریافت شد');
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }
    
    await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز /help برای راهنما استفاده کنید');
    await sendStickerIfExists(ctx, 'start_command');
    
  } catch (error) {
    console.log('❌ خطا در دستور start:', error.message);
  }
});

bot.command('help', async (ctx) => {
  try {
    console.log('ℹ️ دستور /help دریافت شد');
    
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
/removesticker - حذف استیکر

💡 ربات آماده خدمت‌رسانی است`;

    await ctx.reply(helpText);
    await sendStickerIfExists(ctx, 'help_command');
    
  } catch (error) {
    console.log('❌ خطا در دستور help:', error.message);
  }
});

bot.command('status', async (ctx) => {
  try {
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
    await sendStickerIfExists(ctx, 'status_command');
    
  } catch (error) {
    console.log('❌ خطا در دستور status:', error.message);
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
      await ctx.replyWithSticker(stickerFileId);
      await ctx.reply('📝 استیکر بالا ذخیره شد و از این پس بعد از این دستور نمایش داده می‌شود.');
    } else {
      await ctx.reply('❌ خطا در تنظیم استیکر. ممکن است Supabase در دسترس نباشد.');
    }

  } catch (error) {
    console.log('❌ خطا در تنظیم استیکر:', error.message);
    await ctx.reply('❌ خطا در تنظیم استیکر');
  }
});

bot.command('stickerlist', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    let message = '🎭 لیست استیکرهای قابل تنظیم:\n\n';
    
    message += '**دستورات اصلی:**\n';
    for (const [key, config] of Object.entries(stickerConfigs)) {
      if (key.includes('_command')) {
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
    
    message += '\n💡 برای تنظیم استیکر:\n`/setsticker نوع_استیکر`';

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.log('❌ خطا در نمایش لیست استیکرها:', error.message);
    await ctx.reply('❌ خطا در نمایش لیست استیکرها');
  }
});

bot.command('removesticker', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      await ctx.reply(access.message);
      return;
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      await ctx.reply('💡 استفاده: `/removesticker <نوع_استیکر>`');
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

// ==================[ راه‌اندازی ربات ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    const botInfo = await bot.telegram.getMe();
    console.log('✅ ربات شناسایی شد:', botInfo.first_name);
    
    await bot.launch({
      dropPendingUpdates: true,
      polling: {
        timeout: 30,
        limit: 100
      }
    });
    
    console.log('✅ ربات با موفقیت فعال شد');
    
    // اطلاع به مالک
    try {
      await bot.telegram.sendMessage(
        OWNER_ID, 
        `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
        `✅ ربات آماده دریافت دستورات است\n` +
        `💡 از /help برای راهنما استفاده کنید`
      );
    } catch (error) {
      console.log('⚠️ نتوانستم به مالک اطلاع دهم');
    }
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    
    if (error.message.includes('409')) {
      console.log('💡 راهنمایی: لطفاً 2-3 دقیقه صبر کنید سپس دوباره دپلوی کنید');
    }
    
    process.exit(1);
  }
};

// ==================[ سرور اکسپرس ]==================
app.get('/', (req, res) => {
  res.json({ 
    status: '✅ ربات فعال است',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  
  startBot();
  startPingService();
  startWarningSystem();
});

process.once('SIGINT', () => {
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});
