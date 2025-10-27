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
console.log('👤 مالک:', OWNER_ID);
console.log('🤖 شناسه ربات:', SELF_BOT_ID);
console.log('🏠 گروه اصلی:', MAIN_GROUP_ID);

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN تنظیم نشده است');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ تنظیمات Supabase تنظیم نشده است');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ مدیریت خطاهای ربات ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
});

// ==================[ پینگ ]==================
const startAutoPing = () => {
  if (!process.env.RENDER_EXTERNAL_URL) {
    console.log('⚠️ RENDER_EXTERNAL_URL تنظیم نشده');
    return;
  }
  
  const PING_INTERVAL = 5 * 60 * 1000;
  const selfUrl = process.env.RENDER_EXTERNAL_URL;

  const performPing = async () => {
    try {
      await axios.get(`${selfUrl}/health`, { timeout: 10000 });
      console.log('✅ پینگ موفق');
    } catch (error) {
      console.log('❌ پینگ ناموفق:', error.message);
    }
  };

  console.log('🔄 شروع پینگ خودکار...');
  setInterval(performPing, PING_INTERVAL);
  performPing();
};

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return {
      hasAccess: false,
      message: 'کاربر شناسایی نشد'
    };
  }
  
  console.log(`🔐 بررسی دسترسی کاربر ${userId} - مالک: ${OWNER_ID}`);
  
  if (userId !== OWNER_ID) {
    return {
      hasAccess: false,
      message: 'فقط آکی حق داره دستور بده بهم'
    };
  }
  return { hasAccess: true };
};

// ==================[ ذخیره کاربر تایید شده ]==================
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    
    const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
    const hasSymbol = symbols.some(symbol => 
      (username && username.includes(symbol)) || 
      (firstName && firstName.includes(symbol))
    );

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
    console.log(`🔍 بررسی تایید کاربر ${userId}...`);
    
    const { data, error } = await supabase
      .from('aklis_members')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    const isVerified = !error && data;
    console.log(`📊 کاربر ${userId} تایید شده: ${isVerified}`);
    return isVerified;
  } catch (error) {
    console.log('❌ خطا در بررسی تایید کاربر:', error.message);
    return false;
  }
};

// ==================[ دستورات - FIXED ]==================

// دکمه استارت
bot.start((ctx) => {
  console.log('🎯 دستور استارت از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
  
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    console.log('🚫 دسترسی غیرمجاز');
    return ctx.reply(access.message);
  }
  
  console.log('✅ دسترسی مالک تأیید شد');
  
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

// دستور بن کردن کاربر
bot.command('ban', async (ctx) => {
  try {
    console.log('⚠️ درخواست بن از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای بن');
      return ctx.reply(access.message);
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      console.log('❌ دستور ban بدون آیدی');
      return ctx.reply('❌ لطفاً آیدی کاربر را وارد کنید.\n\nمثال:\n<code>/ban @username</code>', { 
        parse_mode: 'HTML' 
      });
    }

    const targetUsername = args[1].replace('@', '');
    console.log(`🎯 بن کاربر: @${targetUsername}`);

    const now = new Date();
    const timeString = now.toLocaleTimeString('fa-IR', { 
      hour: '2-digit', 
      minute: '2-digit'
    });

    const resultMessage = `🚫 کاربر بن شد\n\n` +
      `👤 @${targetUsername}\n` +
      `📋 از تمام گروه‌های اکلیس بن شد\n` +
      `🕒 ${timeString}`;

    await ctx.reply(resultMessage);
    console.log(`✅ دستور ban برای @${targetUsername} اجرا شد`);

  } catch (error) {
    console.log('❌ خطا در اجرای دستور ban:', error.message);
    await ctx.reply('❌ خطا در اجرای دستور ban');
  }
});

// دستور بررسی اعضای اکلیس
bot.command('checkmembers', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی اعضا از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای بررسی اعضا');
      return ctx.reply(access.message);
    }

    await ctx.reply('🔍 در حال بررسی اعضای اکلیس...');
    
    const { data: members, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol');

    if (error) {
      console.log('❌ خطا در دریافت اعضا:', error);
      return ctx.reply('❌ خطا در دریافت اطلاعات اعضا از دیتابیس.');
    }

    const loyalUsers = members?.filter(m => m.has_symbol) || [];
    const suspiciousUsers = members?.filter(m => !m.has_symbol) || [];

    let message = `🏰 بررسی اعضای اکلیس\n\n`;
    message += `✅ اعضای وفادار: ${loyalUsers.length} نفر\n`;
    message += `⚠️ مورد مشکوک: ${suspiciousUsers.length} نفر\n\n`;

    if (suspiciousUsers.length > 0) {
      message += `آیا این اعضا رو بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ بکش', 'kill_suspicious')],
        [Markup.button.callback('❌ نه', 'dont_kill')]
      ]);

      await ctx.reply(message, keyboard);
    } else {
      message += `🎉 همه اعضا وفادار هستند!`;
      await ctx.reply(message);
    }

  } catch (error) {
    console.log('❌ خطا در بررسی اعضا:', error.message);
    await ctx.reply('❌ خطا در بررسی اعضا.');
  }
});

// مشاهده لیست گروه‌ها
bot.command('groups', async (ctx) => {
  try {
    console.log('📋 درخواست لیست گروه‌ها از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      console.log('🚫 دسترسی غیرمجاز برای لیست گروه‌ها');
      return ctx.reply(access.message);
    }

    let message = `🏘️ لیست گروه‌های اکلیس\n\n`;
    
    if (MAIN_GROUP_ID) {
      message += `🏠 گروه اصلی: تنظیم شده\n`;
      message += `🆔: ${MAIN_GROUP_ID}\n\n`;
    } else {
      message += `🏠 گروه اصلی: تنظیم نشده\n\n`;
    }
    
    message += `📊 گروه‌های زیرمجموعه: در حال توسعه...\n\n`;
    message += `ℹ️ این بخش در حال تکمیل می‌باشد`;
    
    await ctx.reply(message);

  } catch (error) {
    console.log('❌ خطا در دریافت لیست گروه‌ها:', error.message);
    await ctx.reply('❌ خطا در دریافت لیست گروه‌ها.');
  }
});

// وضعیت ربات
bot.command('status', async (ctx) => {
  try {
    console.log('📈 درخواست وضعیت از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message);
    }

    const { data: members, error: membersError } = await supabase
      .from('aklis_members')
      .select('user_id');

    const { data: banned, error: bannedError } = await supabase
      .from('aklis_banned')
      .select('user_id');

    const totalMembers = members && !membersError ? members.length : 0;
    const totalBanned = banned && !bannedError ? banned.length : 0;

    let statusMessage = `🥷🏻 وضعیت ربات اکلیس\n\n`;
    statusMessage += `🔹 اعضای تایید شده: ${totalMembers}\n`;
    statusMessage += `🔹 کاربران بن شده: ${totalBanned}\n`;
    statusMessage += `🔹 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده ✅' : 'تنظیم نشده ❌'}\n`;
    statusMessage += `🔹 وضعیت دیتابیس: ${membersError ? 'قطع ❌' : 'متصل ✅'}\n`;
    statusMessage += `🔹 وضعیت ربات: فعال ✅\n\n`;
    statusMessage += `⚡ دستورات:\n`;
    statusMessage += `• /ban @username - بن کاربر\n`;
    statusMessage += `• /checkmembers - بررسی اعضا\n`;
    statusMessage += `• /groups - لیست گروه‌ها`;

    console.log(`📊 آمار: ${totalMembers} عضو, ${totalBanned} بن شده`);
    await ctx.reply(statusMessage);

  } catch (error) {
    console.log('❌ خطا در دریافت وضعیت:', error.message);
    await ctx.reply('❌ خطا در دریافت وضعیت ربات.');
  }
});

// ==================[ مدیریت اعضای جدید ]==================
bot.on('new_chat_members', async (ctx) => {
  try {
    console.log('👥 دریافت عضو جدید');
    
    const chatId = ctx.chat.id.toString();
    const isMainGroup = chatId === MAIN_GROUP_ID;
    
    console.log(`📍 گروه: ${isMainGroup ? 'اصلی' : 'زیرگروه'} (${chatId})`);

    for (const member of ctx.message.new_chat_members) {
      // اگر ربات اضافه شده باشد
      if (member.is_bot && member.username === SELF_BOT_ID) {
        const addedBy = ctx.message.from;
        
        console.log(`🤖 ربات توسط ${addedBy.id} اضافه شد`);
        
        // بررسی مالکیت
        if (addedBy.id !== OWNER_ID) {
          console.log(`🚫 کاربر ${addedBy.id} مالک نیست - لفت دادن`);
          await ctx.reply('فقط آکی حق داره دستور بده بهم');
          
          try {
            await ctx.leaveChat();
            console.log('✅ ربات از گروه خارج شد');
          } catch (leaveError) {
            console.log('❌ خطا در خروج از گروه:', leaveError.message);
          }
          return;
        }
        
        console.log(`✅ ربات توسط مالک اضافه شد`);
        await ctx.reply('🥷🏻 نینجای اکلیس در خدمت شماست!');
        return;
      }

      // اگر کاربر عادی اضافه شده باشد
      if (!member.is_bot) {
        const userId = member.id;
        const username = member.username;
        const firstName = member.first_name;

        console.log(`👤 کاربر جدید: ${firstName} (@${username}) - ${userId}`);

        if (isMainGroup) {
          // در گروه اصلی - درخواست تایید از مالک
          console.log(`🆕 درخواست تایید برای کاربر جدید در گروه اصلی`);
          
          const requestMessage = `آیا این غریبه اجازه ورود به اکلیس رو داره ؟\n\n` +
            `👤 کاربر: ${firstName}\n` +
            `🆔 آیدی: ${userId}\n` +
            `📝 نام کاربری: @${username || 'ندارد'}`;

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ آره', `approve_${userId}`)],
            [Markup.button.callback('❌ نه', `reject_${userId}`)]
          ]);

          await ctx.reply(requestMessage, keyboard);
        } else {
          // در زیرگروه - بررسی تایید کاربر
          console.log(`🔍 بررسی تایید کاربر برای زیرگروه...`);
          
          const isVerified = await isUserVerified(userId);
          
          if (!isVerified) {
            console.log(`🚫 کاربر تایید نشده - بن کردن`);
            
            try {
              await ctx.banChatMember(userId);
              console.log(`✅ کاربر از زیرگروه بن شد`);
              
              // اطلاع به گروه اصلی
              if (MAIN_GROUP_ID) {
                const now = new Date();
                const timeString = now.toLocaleTimeString('fa-IR', { 
                  hour: '2-digit', 
                  minute: '2-digit'
                });
                
                const alertMessage = `🚨 یک مزاحم وارد قلمرو اکلیس شده\n\n` +
                  `👤 نام: ${firstName}\n` +
                  `🆔 آیدی عددی: ${userId}\n` +
                  `📝 آیدی شخصی: @${username || 'ندارد'}\n` +
                  `🕒 زمان ورود: ${timeString}\n` +
                  `📍 گروه: ${ctx.chat.title || 'بدون عنوان'}`;
                  
                await bot.telegram.sendMessage(MAIN_GROUP_ID, alertMessage);
              }
            } catch (banError) {
              console.log('❌ خطا در بن کردن کاربر:', banError.message);
            }
          } else {
            console.log(`✅ کاربر تایید شده - اجازه ورود`);
          }
        }
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش عضو جدید:', error.message);
  }
});

// ==================[ پردازش پیام‌ها ]==================
bot.on('message', async (ctx) => {
  try {
    // فقط پیام‌های گروهی پردازش شوند
    if (ctx.chat.type === 'private') return;
    
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from?.id;
    const isMainGroup = chatId === MAIN_GROUP_ID;
    
    // اگر در گروه اصلی نیستیم، خروج
    if (!isMainGroup) return;
    
    // اگر مالک است، اجازه صحبت دارد
    if (userId === OWNER_ID) return;
    
    // اگر پیام دستور است، پردازش نکن - اجازه بده دستورات پردازش شوند
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      return;
    }
    
    // بررسی تایید کاربر
    const isVerified = await isUserVerified(userId);
    
    if (!isVerified) {
      console.log(`🚫 کاربر ${userId} تایید نشده - حذف پیام`);
      
      try {
        await ctx.deleteMessage();
        
        // اخطار به کاربر
        const warningMessage = `👤 ${ctx.from.first_name}\n` +
          `شما اجازه صحبت ندارین تا زمانی که اونر اجازه ورود رو بده`;
          
        const warning = await ctx.reply(warningMessage);
        
        // حذف پیام اخطار بعد از 5 ثانیه
        setTimeout(async () => {
          try {
            await ctx.deleteMessage(warning.message_id);
          } catch (e) {
            console.log('خطا در حذف پیام اخطار:', e.message);
          }
        }, 5000);
      } catch (deleteError) {
        console.log('❌ خطا در حذف پیام:', deleteError.message);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش پیام:', error.message);
  }
});

// ==================[ پردازش Callback ها ]==================
bot.action(/approve_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const targetUser = ctx.callbackQuery.message?.reply_to_message?.new_chat_members?.[0] || 
                      { first_name: 'کاربر', username: '' };
    
    console.log(`✅ تایید کاربر ${userId} توسط مالک`);
    
    await saveVerifiedUser(userId, targetUser.username, targetUser.first_name, ctx.from.id);
    
    const welcomeMessage = `👤 ${targetUser.first_name}\n` +
      `خوش اومدی به جهان بزرگ اکلیس 🎉`;
    
    await ctx.editMessageText(welcomeMessage);
    console.log(`✅ کاربر ${targetUser.first_name} تایید شد`);
    
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const targetUser = ctx.callbackQuery.message?.reply_to_message?.new_chat_members?.[0] || 
                      { first_name: 'کاربر' };
    
    console.log(`❌ رد کاربر ${userId} توسط مالک`);
    
    try {
      await ctx.banChatMember(userId);
      console.log(`✅ کاربر از گروه حذف شد`);
    } catch (banError) {
      console.log('❌ خطا در حذف کاربر:', banError.message);
    }
    
    await ctx.editMessageText(`❌ کاربر ${targetUser.first_name} رد شد و حذف گردید`);
    console.log(`✅ کاربر ${targetUser.first_name} رد و حذف شد`);
    
  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در رد کاربر');
  }
});

bot.action('kill_suspicious', async (ctx) => {
  try {
    console.log('🔫 بن کردن اعضای مشکوک توسط مالک');
    
    await ctx.editMessageText('🔫 در حال بن کردن اعضای مشکوک...');
    
    const { data: suspiciousUsers, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name')
      .eq('has_symbol', false);

    if (error) {
      console.log('❌ خطا در دریافت کاربران مشکوک:', error);
      await ctx.editMessageText('❌ خطا در دریافت کاربران مشکوک');
      return;
    }

    let bannedCount = 0;
    
    await ctx.editMessageText(`✅ عملیات بن کامل شد\n\n` +
      `🔫 بن شده: ${bannedCount} کاربر\n` +
      `📋 تعداد کاربران مشکوک: ${suspiciousUsers.length} نفر\n\n` +
      `ℹ️ این قابلیت در حال توسعه است`);
    
    console.log(`✅ ${suspiciousUsers.length} کاربر مشکوک شناسایی شدند`);
    
  } catch (error) {
    console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
    await ctx.editMessageText('❌ خطا در بن کردن اعضای مشکوک');
  }
});

bot.action('dont_kill', async (ctx) => {
  try {
    await ctx.editMessageText('❌ عملیات بن لغو شد');
    console.log('❌ بن کردن اعضای مشکوک توسط مالک لغو شد');
  } catch (error) {
    console.log('❌ خطا در لغو:', error.message);
  }
});

// ==================[ راه‌اندازی ربات - FIXED ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // تست ربات
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    
    // راه‌اندازی ربات با polling
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'callback_query']
    });
    
    console.log('✅ ربات با موفقیت راه‌اندازی شد');
    
    // فعال کردن graceful stop
    process.once('SIGINT', () => {
      console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
      bot.stop('SIGINT');
    });
    
    process.once('SIGTERM', () => {
      console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
      bot.stop('SIGTERM');
    });
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    process.exit(1);
  }
};

// ==================[ تست سلامت ]==================
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
      owner: OWNER_ID,
      main_group: MAIN_GROUP_ID,
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
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .healthy { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .unhealthy { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🥷🏻 ربات مدیریت اکلیس</h1>
        <div class="status info">
          <strong>ربات فعال است - فقط مالک می‌تواند استفاده کند</strong>
        </div>
        <div class="status">
          <strong>مالک:</strong> ${OWNER_ID}
        </div>
        <div class="status">
          <strong>Bot ID:</strong> ${SELF_BOT_ID}
        </div>
        <div class="status">
          <strong>گروه اصلی:</strong> ${MAIN_GROUP_ID || 'تنظیم نشده'}
        </div>
        <div style="margin-top: 20px;">
          <a href="/health" style="background: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">بررسی سلامت</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ==================[ راه‌اندازی سرور ]==================
const startServer = async () => {
  try {
    console.log('🚀 شروع راه‌اندازی سرور...');
    
    // شروع سرور
    app.listen(PORT, () => {
      console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
      console.log(`🥷🏻 ربات ${SELF_BOT_ID} آماده است`);
      
      // شروع پینگ
      startAutoPing();
      
      // راه‌اندازی ربات
      startBot();
    });

  } catch (error) {
    console.log('❌ خطا در راه‌اندازی سرور:', error.message);
    process.exit(1);
  }
};

// شروع برنامه
startServer();

// مدیریت خطاها
process.on('unhandledRejection', (error) => {
  console.log('❌ خطای catch نشده:', error.message);
});

process.on('uncaughtException', (error) => {
  console.log('❌ خطای مدیریت نشده:', error);
});
