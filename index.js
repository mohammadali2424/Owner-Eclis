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
const SELF_BOT_ID = process.env.SELF_BOT_ID || 'aklis_bot_main';
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';

console.log('🔧 شروع راه‌اندازی ربات مدیریت اکلیس...');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ نمادهای وفاداری - FIXED ]==================
const LOYALTY_SYMBOLS = ['𖢻', 'ꑭ', '𖮌', '꩘'];
console.log('🔍 نمادهای وفاداری:', LOYALTY_SYMBOLS);

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return {
      hasAccess: false,
      message: 'کاربر شناسایی نشد'
    };
  }
  
  if (userId !== OWNER_ID) {
    return {
      hasAccess: false,
      message: 'فقط آکی حق داره دستور بده بهم'
    };
  }
  return { hasAccess: true };
};

const checkOwnerAccessCallback = (ctx) => {
  const userId = ctx.from?.id;
  return userId === OWNER_ID;
};

// ==================[ بررسی نماد وفاداری - COMPLETELY FIXED ]==================
const checkLoyaltySymbol = (text) => {
  if (!text) return false;
  
  const textStr = String(text);
  console.log(`🔍 بررسی نماد در متن: "${textStr}"`);
  
  for (const symbol of LOYALTY_SYMBOLS) {
    if (textStr.includes(symbol)) {
      console.log(`✅ نماد "${symbol}" پیدا شد`);
      return true;
    }
  }
  
  console.log(`❌ هیچ نمادی پیدا نشد`);
  return false;
};

// ==================[ ذخیره کاربر تایید شده - FIXED ]==================
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    
    // بررسی دقیق نمادها در نام و نام کاربری
    const hasSymbolInName = checkLoyaltySymbol(firstName);
    const hasSymbolInUsername = checkLoyaltySymbol(username);
    const hasSymbol = hasSymbolInName || hasSymbolInUsername;

    console.log(`📊 نتیجه بررسی نماد برای ${firstName} (@${username}): ${hasSymbol}`);

    const { error } = await supabase
      .from('aklis_members')
      .upsert({
        user_id: userId,
        username: username || '',
        first_name: firstName || 'ناشناس',
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        has_symbol: hasSymbol
      }, { onConflict: 'user_id' });

    if (error) {
      console.log('❌ خطا در ذخیره کاربر تایید شده:', error);
      return false;
    }
    
    console.log(`✅ کاربر ${userId} تایید شد - نماد: ${hasSymbol}`);
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره کاربر تایید شده:', error.message);
    return false;
  }
};

// ==================[ بررسی تایید کاربر ]==================
const isUserVerified = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('aklis_members')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    return !error && data;
  } catch (error) {
    console.log('❌ خطا در بررسی تایید کاربر:', error.message);
    return false;
  }
};

// ==================[ دریافت کاربران مشکوک ]==================
const getSuspiciousUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol')
      .eq('has_symbol', false);

    if (error) {
      console.log('❌ خطا در دریافت کاربران مشکوک:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('❌ خطا در دریافت کاربران مشکوک:', error.message);
    return [];
  }
};

// ==================[ بن کردن کاربر از گروه اصلی - COMPLETELY FIXED ]==================
const banUserFromMainGroup = async (userId, username, firstName) => {
  try {
    console.log(`🔫 بن کردن کاربر ${userId} از گروه اصلی`);
    
    if (!MAIN_GROUP_ID) {
      console.log('❌ گروه اصلی تنظیم نشده');
      return false;
    }

    try {
      // بن کردن کاربر از گروه اصلی
      await bot.telegram.banChatMember(MAIN_GROUP_ID, userId);
      console.log(`✅ کاربر ${firstName} از گروه اصلی بن شد`);
      
      // حذف کاربر از جدول اعضا
      const { error: deleteError } = await supabase
        .from('aklis_members')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.log('❌ خطا در حذف کاربر از دیتابیس:', deleteError);
      }
      
      // ذخیره در جدول بن شده‌ها
      const { error } = await supabase
        .from('aklis_banned')
        .upsert({
          user_id: userId,
          username: username || '',
          first_name: firstName || 'ناشناس',
          banned_at: new Date().toISOString(),
          banned_by: OWNER_ID
        }, { onConflict: 'user_id' });

      if (error) {
        console.log('❌ خطا در ذخیره اطلاعات بن:', error);
      }
      
      return true;
    } catch (banError) {
      console.log('❌ خطا در بن کردن کاربر:', banError.message);
      
      // حتی اگر بن کردن موفق نبود، کاربر را از دیتابیس حذف کن
      const { error: deleteError } = await supabase
        .from('aklis_members')
        .delete()
        .eq('user_id', userId);

      if (!deleteError) {
        console.log(`✅ کاربر ${userId} از دیتابیس حذف شد`);
      }
      
      return false;
    }
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربر از گروه اصلی:', error.message);
    return false;
  }
};

// ==================[ دستورات ]==================

// دکمه استارت
bot.start((ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message);
  }
  
  const replyText = `🥷🏻 نینجای اکلیس در خدمت شماست\n\n` +
    `🔹 /ban [آیدی] - بن کردن کاربر\n` +
    `🔹 /groups - مشاهده لیست گروه‌ها\n` +
    `🔹 /checkmembers - بررسی اعضای اکلیس\n` +
    `🔹 /status - وضعیت ربات\n\n` +
    `🏠 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده' : 'تنظیم نشده'}`;
  
  if (ctx.chat.type === 'private') {
    return ctx.reply(replyText, Markup.keyboard([
      ['/ban', '/groups'],
      ['/checkmembers', '/status']
    ]).resize());
  } else {
    return ctx.reply(replyText);
  }
});

// دستور بررسی اعضای اکلیس - FIXED
bot.command('checkmembers', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message);
    }

    await ctx.reply('🔍 در حال بررسی اعضای اکلیس...');
    
    const { data: members, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol, verified_at');

    if (error) {
      console.log('❌ خطا در دریافت اعضا:', error);
      return ctx.reply('❌ خطا در دریافت اطلاعات اعضا از دیتابیس.');
    }

    const loyalUsers = members?.filter(m => m.has_symbol) || [];
    const suspiciousUsers = members?.filter(m => !m.has_symbol) || [];

    let message = `🏰 بررسی اعضای اکلیس\n\n`;
    message += `✅ اعضای وفادار: ${loyalUsers.length} نفر\n`;
    message += `⚠️ اعضای مشکوک: ${suspiciousUsers.length} نفر\n\n`;

    if (suspiciousUsers.length > 0) {
      // نمایش لیست کاربران مشکوک برای شفافیت
      message += `👥 کاربران مشکوک:\n`;
      suspiciousUsers.slice(0, 10).forEach((user, index) => {
        message += `${index + 1}. ${user.first_name} (@${user.username || 'ندارد'})\n`;
      });
      
      if (suspiciousUsers.length > 10) {
        message += `... و ${suspiciousUsers.length - 10} کاربر دیگر\n\n`;
      }
      
      message += `آیا ${suspiciousUsers.length} اعضای مشکوک رو بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`✅ آره - بن کردن ${suspiciousUsers.length} کاربر`, 'kill_suspicious')],
        [Markup.button.callback('❌ نه', 'dont_kill')]
      ]);

      await ctx.reply(message, keyboard);
    } else {
      message += `🎉 همه اعضا وفادار هستند! هیچ اقدام لازم نیست.`;
      await ctx.reply(message);
    }

  } catch (error) {
    console.log('❌ خطا در بررسی اعضا:', error.message);
    await ctx.reply('❌ خطا در بررسی اعضا.');
  }
});

// ==================[ پردازش Callback ها - COMPLETELY FIXED ]==================
bot.action(/approve_(\d+)_(.+)_(.+)/, async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

    const userId = parseInt(ctx.match[1]);
    const username = ctx.match[2] === 'null' ? '' : ctx.match[2];
    const firstName = decodeURIComponent(ctx.match[3]);
    
    console.log(`✅ تایید کاربر ${userId} توسط مالک`);
    
    const success = await saveVerifiedUser(userId, username, firstName, ctx.from.id);
    
    if (success) {
      const welcomeMessage = `👤 ${firstName}\n` +
        `خوش اومدی به جهان بزرگ اکلیس 🎉`;
      
      await ctx.editMessageText(welcomeMessage);
      await ctx.answerCbQuery('کاربر تایید شد');
      console.log(`✅ کاربر ${firstName} تایید شد`);
    } else {
      await ctx.answerCbQuery('❌ خطا در تایید کاربر', { show_alert: true });
    }
    
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در تایید کاربر');
  }
});

bot.action('kill_suspicious', async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

    console.log('🔫 بن کردن اعضای مشکوک توسط مالک');
    
    await ctx.editMessageText('🔫 در حال بن کردن اعضای مشکوک... لطفاً صبر کنید');
    
    const suspiciousUsers = await getSuspiciousUsers();
    
    if (suspiciousUsers.length === 0) {
      await ctx.editMessageText('✅ هیچ کاربر مشکوکی برای بن کردن وجود ندارد');
      return;
    }

    let bannedCount = 0;
    let failedCount = 0;
    let results = [];
    
    // بن کردن واقعی کاربران مشکوک
    for (const user of suspiciousUsers) {
      console.log(`🔫 در حال بن کردن کاربر: ${user.first_name} (${user.user_id})`);
      
      const success = await banUserFromMainGroup(user.user_id, user.username, user.first_name);
      if (success) {
        bannedCount++;
        results.push(`✅ ${user.first_name} (@${user.username || 'ندارد'}) - بن شد`);
        console.log(`✅ کاربر ${user.first_name} با موفقیت بن شد`);
      } else {
        failedCount++;
        results.push(`❌ ${user.first_name} (@${user.username || 'ندارد'}) - خطا در بن`);
        console.log(`❌ خطا در بن کردن کاربر ${user.first_name}`);
      }
      
      // تاخیر بین بن کردن کاربران برای جلوگیری از محدودیت تلگرام
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // نمایش نتیجه واقعی با جزئیات
    let resultMessage = `🎯 نتیجه عملیات بن\n\n`;
    resultMessage += `✅ بن شده: ${bannedCount} کاربر\n`;
    resultMessage += `❌ خطا در بن: ${failedCount} کاربر\n`;
    resultMessage += `📋 تعداد کل: ${suspiciousUsers.length} نفر\n\n`;
    
    // نمایش 10 نتیجه اول
    if (results.length > 0) {
      resultMessage += `📊 نتایج:\n`;
      resultMessage += results.slice(0, 10).join('\n');
      
      if (results.length > 10) {
        resultMessage += `\n... و ${results.length - 10} نتیجه دیگر`;
      }
    }
    
    await ctx.editMessageText(resultMessage);
    console.log(`✅ ${bannedCount} کاربر مشکوک بن شدند`);
    
  } catch (error) {
    console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
    await ctx.editMessageText('❌ خطا در بن کردن اعضای مشکوک: ' + error.message);
  }
});

// ==================[ مدیریت اعضای جدید - FIXED ]==================
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    const isMainGroup = chatId === MAIN_GROUP_ID;
    
    for (const member of ctx.message.new_chat_members) {
      if (member.is_bot && member.username === SELF_BOT_ID) {
        const addedBy = ctx.message.from;
        
        if (addedBy.id !== OWNER_ID) {
          await ctx.reply('فقط آکی حق داره دستور بده بهم');
          await ctx.leaveChat();
          return;
        }
        
        await ctx.reply('🥷🏻 نینجای اکلیس در خدمت شماست!');
        return;
      }

      if (!member.is_bot) {
        const userId = member.id;
        const username = member.username;
        const firstName = member.first_name;

        console.log(`👤 کاربر جدید: ${firstName} (@${username}) - ${userId}`);

        if (isMainGroup) {
          // بررسی سریع نماد قبل از درخواست تایید
          const hasSymbol = checkLoyaltySymbol(firstName) || checkLoyaltySymbol(username);
          
          const requestMessage = `آیا این غریبه اجازه ورود به اکلیس رو داره ؟\n\n` +
            `👤 کاربر: ${firstName}\n` +
            `🆔 آیدی: ${userId}\n` +
            `📝 نام کاربری: @${username || 'ندارد'}\n` +
            `🎯 نماد وفاداری: ${hasSymbol ? '✅ دارد' : '❌ ندارد'}`;

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ آره', `approve_${userId}_${username || 'null'}_${encodeURIComponent(firstName || '')}`)],
            [Markup.button.callback('❌ نه', `reject_${userId}`)]
          ]);

          await ctx.reply(requestMessage, keyboard);
        } else {
          const isVerified = await isUserVerified(userId);
          
          if (!isVerified) {
            try {
              await ctx.banChatMember(userId);
              console.log(`✅ کاربر از زیرگروه بن شد`);
            } catch (banError) {
              console.log('❌ خطا در بن کردن کاربر:', banError.message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش عضو جدید:', error.message);
  }
});

// ==================[ راه‌اندازی ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'callback_query']
    });
    
    console.log('✅ ربات با موفقیت راه‌اندازی شد');
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    process.exit(1);
  }
};

// ==================[ سرور ]==================
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aklis_members')
      .select('count')
      .limit(1);

    res.json({
      status: 'healthy',
      bot: SELF_BOT_ID,
      database: error ? 'disconnected' : 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>🥷🏻 ربات مدیریت اکلیس</title>
      <meta charset="utf-8">
    </head>
    <body>
      <h1>🥷🏻 ربات مدیریت اکلیس</h1>
      <p>ربات فعال است - فقط مالک می‌تواند استفاده کند</p>
      <p><strong>نمادهای وفاداری:</strong> ${LOYALTY_SYMBOLS.join(', ')}</p>
    </body>
    </html>
  `);
});

// شروع سرور
app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  console.log(`🥷🏻 ربات ${SELF_BOT_ID} آماده است`);
  console.log(`🔍 نمادهای فعال: ${LOYALTY_SYMBOLS.join(', ')}`);
  startBot();
});

// مدیریت خطاها
process.on('unhandledRejection', (error) => {
  console.log('❌ خطای catch نشده:', error.message);
});

process.on('uncaughtException', (error) => {
  console.log('❌ خطای مدیریت نشده:', error);
});
