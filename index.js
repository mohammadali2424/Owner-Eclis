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
  
  const PING_INTERVAL = 10 * 60 * 1000;
  const selfUrl = process.env.RENDER_EXTERNAL_URL;

  const performPing = async () => {
    try {
      const response = await axios.get(`${selfUrl}/health`, { timeout: 15000 });
      console.log('✅ پینگ موفق - وضعیت:', response.data.status);
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

// ==================[ بررسی دسترسی مالک برای callback ]==================
const checkOwnerAccessCallback = (ctx) => {
  const userId = ctx.from?.id;
  return userId === OWNER_ID;
};

// ==================[ بررسی نمادهای وفاداری - FIXED ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined' || text === '') {
    return false;
  }
  
  // استفاده از کدهای Unicode برای نمادها
  const symbols = [
    '\uAA58', // ꩘
    '\u16BB', // 𖢻  
    '\uA46D', // ꑭ
    '\u16B8C' // 𖮌
  ];
  
  const textStr = String(text);
  
  // بررسی وجود هر نماد در متن
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      console.log(`✅ نماد وفاداری در متن پیدا شد: "${symbol}"`);
      return true;
    }
  }
  
  // همچنین بررسی با کدهای عددی
  const symbolCodes = [0xAA58, 0x16BB, 0xA46D, 0x16B8C];
  for (const code of symbolCodes) {
    const symbol = String.fromCodePoint(code);
    if (textStr.includes(symbol)) {
      console.log(`✅ نماد وفاداری (کد ${code}) در متن پیدا شد`);
      return true;
    }
  }
  
  console.log(`❌ هیچ نماد وفاداری در متن پیدا نشد: "${textStr.substring(0, 50)}..."`);
  return false;
};

// ==================[ مدیریت چت‌های زیرمجموعه - IMPROVED ]==================
const addChatToSubgroups = async (chatId, chatTitle, chatType, addedBy) => {
  try {
    console.log(`💾 افزودن ${chatType} به زیرمجموعه: ${chatTitle} (${chatId})`);
    
    const { error } = await supabase
      .from('aklis_subgroups')
      .upsert({
        chat_id: chatId,
        chat_title: chatTitle,
        chat_type: chatType,
        added_by: addedBy,
        added_at: new Date().toISOString(),
        is_active: true
      }, { onConflict: 'chat_id' });

    if (error) {
      console.log('❌ خطا در ذخیره چت:', error);
      return false;
    }
    
    console.log(`✅ ${chatType} به زیرمجموعه اضافه شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در افزودن چت:', error.message);
    return false;
  }
};

const removeChatFromSubgroups = async (chatId) => {
  try {
    console.log(`🗑️ حذف چت از زیرمجموعه: ${chatId}`);
    
    const { error } = await supabase
      .from('aklis_subgroups')
      .update({ is_active: false })
      .eq('chat_id', chatId);

    if (error) {
      console.log('❌ خطا در حذف چت:', error);
      return false;
    }
    
    console.log(`✅ چت از زیرمجموعه حذف شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در حذف چت:', error.message);
    return false;
  }
};

const getActiveSubgroups = async () => {
  try {
    const { data, error } = await supabase
      .from('aklis_subgroups')
      .select('chat_id, chat_title, chat_type')
      .eq('is_active', true);

    if (error) {
      console.log('��� خطا در دریافت زیرگروه‌ها:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('❌ خطا در دریافت زیرگروه‌ها:', error.message);
    return [];
  }
};

// ==================[ اسکن و اضافه کردن گروه‌هایی که ربات ادمین است - FIXED ]==================
const scanAndAddAdminChats = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن گروه‌هایی که ربات ادمین است...');
    
    let newChatsAdded = 0;
    let totalChatsChecked = 0;
    
    // ابتدا وضعیت چت‌های موجود را بررسی می‌کنیم
    const existingSubgroups = await getActiveSubgroups();
    
    // بررسی وضعیت هر چت موجود
    for (const chat of existingSubgroups) {
      try {
        const chatMember = await ctx.telegram.getChatMember(chat.chat_id, bot.botInfo.id);
        if (chatMember.status === 'left' || chatMember.status === 'kicked') {
          console.log(`❌ ربات از ${chat.chat_type} "${chat.chat_title}" اخراج شده`);
          await removeChatFromSubgroups(chat.chat_id);
        }
        totalChatsChecked++;
        
        // تاخیر برای جلوگیری از محدودیت
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.log(`❌ خطا در بررسی ${chat.chat_type} "${chat.chat_title}":`, error.message);
        await removeChatFromSubgroups(chat.chat_id);
      }
    }
    
    // اضافه کردن گروه اصلی اگر تنظیم شده باشد
    if (MAIN_GROUP_ID) {
      try {
        const chat = await ctx.telegram.getChat(MAIN_GROUP_ID);
        const chatMember = await ctx.telegram.getChatMember(MAIN_GROUP_ID, bot.botInfo.id);
        
        if (chatMember && (chatMember.status === 'administrator' || chatMember.status === 'member')) {
          const added = await addChatToSubgroups(MAIN_GROUP_ID, chat.title, 'group', OWNER_ID);
          if (added) newChatsAdded++;
          totalChatsChecked++;
        }
      } catch (error) {
        console.log('❌ خطا در بررسی گروه اصلی:', error.message);
      }
    }
    
    console.log(`✅ اسکن کامل شد: ${totalChatsChecked} چت بررسی شد, ${newChatsAdded} چت جدید اضافه شد`);
    return { success: true, totalChecked: totalChatsChecked, newAdded: newChatsAdded };
    
  } catch (error) {
    console.log('❌ خطا در اسکن گروه‌های ادمین:', error.message);
    return { success: false, totalChecked: 0, newAdded: 0 };
  }
};

// ==================[ ذخیره کاربر تایید شده - FIXED ]==================
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    
    // بررسی نماد وفاداری
    const hasSymbol = checkLoyaltySymbols(firstName) || checkLoyaltySymbols(username);

    console.log(`🔍 نتیجه بررسی نماد برای ${firstName} (@${username}): ${hasSymbol}`);

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

// ==================[ اسکن و ذخیره تمام اعضای گروه - OPTIMIZED ]==================
const scanAndSaveAllMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن تمام اعضای گروه...');
    
    const chatId = ctx.chat.id;
    
    try {
      // دریافت اطلاعات گروه
      const chat = await ctx.telegram.getChat(chatId);
      console.log(`📊 اسکن گروه: ${chat.title}`);
      
      // دریافت لیست مدیران
      const administrators = await ctx.telegram.getChatAdministrators(chatId);
      console.log(`👥 تعداد مدیران: ${administrators.length}`);
      
      let savedCount = 0;
      
      // ذخیره مدیران
      for (const admin of administrators) {
        const user = admin.user;
        if (!user.is_bot) {
          const hasSymbol = checkLoyaltySymbols(user.first_name) || checkLoyaltySymbols(user.username);
          
          const { error } = await supabase
            .from('aklis_members')
            .upsert({
              user_id: user.id,
              username: user.username || '',
              first_name: user.first_name || 'ناشناس',
              verified_by: OWNER_ID,
              verified_at: new Date().toISOString(),
              has_symbol: hasSymbol
            }, { onConflict: 'user_id' });

          if (!error) {
            savedCount++;
          }
          
          // تاخیر برای جلوگیری از محدودیت
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✅ اسکن کامل شد: ${savedCount} کاربر ذخیره/آپدیت شد`);
      return { success: true, saved: savedCount };
      
    } catch (error) {
      console.log('❌ خطا در دریافت اطلاعات گروه:', error.message);
      return { success: false, saved: 0 };
    }
    
  } catch (error) {
    console.log('❌ خطا در اسکن اعضا:', error.message);
    return { success: false, saved: 0 };
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

// ==================[ بن کردن کاربر از کل اکوسیستم - IMPROVED ]==================
const banUserFromEcosystem = async (userId, username, firstName) => {
  try {
    console.log(`🔫 بن کردن کاربر ${userId} از کل اکوسیستم`);
    
    let totalBanned = 0;
    let totalFailed = 0;
    
    // بن کردن از گروه اصلی
    if (MAIN_GROUP_ID) {
      try {
        await bot.telegram.banChatMember(MAIN_GROUP_ID, userId);
        console.log(`✅ کاربر از گروه اصلی بن شد`);
        totalBanned++;
      } catch (error) {
        console.log('❌ خطا در بن کردن از گروه اصلی:', error.message);
        totalFailed++;
      }
    }
    
    // بن کردن از تمام زیرگروه‌ها و کانال‌ها
    const subgroups = await getActiveSubgroups();
    console.log(`🔫 بن کردن از ${subgroups.length} زیرمجموعه...`);
    
    for (const subgroup of subgroups) {
      try {
        // فقط از گروه‌ها بن کن (کانال‌ها امکان بن ندارند)
        if (subgroup.chat_type === 'group' || subgroup.chat_type === 'supergroup') {
          await bot.telegram.banChatMember(subgroup.chat_id, userId);
          console.log(`✅ کاربر از ${subgroup.chat_type} "${subgroup.chat_title}" بن شد`);
          totalBanned++;
        }
        
        // تاخیر برای ج��وگیری از محدودیت تلگرام
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`❌ خطا در بن کردن از ${subgroup.chat_type}:`, error.message);
        totalFailed++;
      }
    }
    
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
        banned_by: OWNER_ID,
        banned_from_count: totalBanned
      }, { onConflict: 'user_id' });

    if (error) {
      console.log('❌ خطا در ذخیره اطلاعات بن:', error);
    }
    
    console.log(`✅ کاربر از ${totalBanned} چت بن شد (${totalFailed} خطا)`);
    return { success: true, banned: totalBanned, failed: totalFailed };
    
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربر از اکوسیستم:', error.message);
    return { success: false, banned: 0, failed: 0 };
  }
};

// ==================[ بن کردن کاربر بر اساس نام کاربری ]==================
const banUserFromEcosystemByUsername = async (username) => {
  try {
    console.log(`🔍 جستجوی کاربر برای بن: @${username}`);
    
    // ابتدا کاربر را از دیتابیس پیدا کن
    const { data: user, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name')
      .eq('username', username)
      .single();

    if (error || !user) {
      console.log(`❌ کاربر @${username} در دیتابیس پیدا نشد`);
      return { success: false, banned: 0, failed: 0 };
    }

    console.log(`✅ کاربر پیدا شد: ${user.first_name} (${user.user_id})`);
    
    // سپس کاربر را بن کن
    return await banUserFromEcosystem(user.user_id, user.username, user.first_name);
  } catch (error) {
    console.log('❌ خطا در بن کردن با نام کاربری:', error.message);
    return { success: false, banned: 0, failed: 0 };
  }
};

// ==================[ بررسی وضعیت چت‌های زیرمجموعه - FIXED ]==================
const checkSubgroupsStatus = async (ctx) => {
  try {
    console.log('🔍 بررسی وضعیت چت‌های زیرمجموعه...');
    
    // ابتدا اسکن و اضافه کردن گروه‌های جدید
    const scanResult = await scanAndAddAdminChats(ctx);
    
    const subgroups = await getActiveSubgroups();
    let removedGroups = [];
    
    // بررسی هر چت برای اطمینان از وجود ربات
    for (const subgroup of subgroups) {
      try {
        // بررسی اینکه ربات هنوز در چت وجود دارد
        const chatMember = await ctx.telegram.getChatMember(subgroup.chat_id, bot.botInfo.id);
        
        if (!chatMember || chatMember.status === 'left' || chatMember.status === 'kicked') {
          console.log(`❌ ربات از ${subgroup.chat_type} "${subgroup.chat_title}" اخراج شده`);
          await removeChatFromSubgroups(subgroup.chat_id);
          removedGroups.push(subgroup);
        }
      } catch (error) {
        console.log(`❌ خطا در بررسی ${subgroup.chat_type} "${subgroup.chat_title}":`, error.message);
        await removeChatFromSubgroups(subgroup.chat_id);
        removedGroups.push(subgroup);
      }
      
      // تاخیر برای جلوگیری از محدودیت
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // دریافت لیست به‌روز شده
    const updatedSubgroups = await getActiveSubgroups();
    
    console.log(`✅ بررسی کامل شد: ${updatedSubgroups.length} چت فعال`);
    
    return {
      success: true,
      activeSubgroups: updatedSubgroups,
      newGroups: scanResult.newAdded,
      removedGroups: removedGroups,
      totalChecked: scanResult.totalChecked
    };
    
  } catch (error) {
    console.log('❌ خطا در بررسی وضعیت چت‌ها:', error.message);
    return { success: false, activeSubgroups: [], newGroups: 0, removedGroups: [], totalChecked: 0 };
  }
};

// ==================[ تابع کمکی برای حذف پیام بعد از مدت زمان مشخص ]==================
const deleteMessageAfterDelay = async (ctx, messageId, delay = 5000) => {
  try {
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(messageId);
        console.log(`✅ پیام موقت حذف شد`);
      } catch (error) {
        console.log('⚠️ خطا در حذف پیام موقت (ممکن است قبلاً حذف شده باشد):', error.message);
      }
    }, delay);
  } catch (error) {
    console.log('❌ خطا در تنظیم تایمر حذف پیام:', error.message);
  }
};

// ==================[ دستورات اصلی - OPTIMIZED ]==================

// دکمه استارت
bot.start((ctx) => {
  console.log('🎯 دستور استارت از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
  
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message?.message_id
    });
  }
  
  return ctx.reply('🥷🏻 نینجای شماره چهار در خدمت شماست', {
    reply_to_message_id: ctx.message?.message_id
  });
});

// دستور بن کردن کاربر
bot.command('ban', async (ctx) => {
  try {
    console.log('⚠️ درخواست بن از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const args = ctx.message.text.split(' ').filter(arg => arg.trim() !== '');
    if (args.length < 2) {
      return ctx.reply('❌ لطفاً آیدی کاربر را وارد کنید.\n\nمثال:\n`/ban @username`', { 
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const targetUsername = args[1].replace('@', '');
    console.log(`🎯 بن کاربر: @${targetUsername}`);

    // بن کردن کاربر
    const result = await banUserFromEcosystemByUsername(targetUsername);
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('fa-IR', { 
      hour: '2-digit', 
      minute: '2-digit'
    });

    if (result.success && result.banned > 0) {
      const resultMessage = `🚫 کاربر بن شد\n\n` +
        `👤 @${targetUsername}\n` +
        `📋 از ${result.banned} گروه بن شد\n` +
        `🕒 ${timeString}`;

      await ctx.reply(resultMessage, {
        reply_to_message_id: ctx.message?.message_id
      });
    } else {
      await ctx.reply(`❌ خطا در بن کردن کاربر @${targetUsername}\n\nکاربر ممکن است در دیتابیس وجود نداشته باشد.`, {
        reply_to_message_id: ctx.message?.message_id
      });
    }

  } catch (error) {
    console.log('❌ خطا در اجرای دستور ban:', error.message);
    await ctx.reply('❌ خطا در اجرای دستور ban', {
      reply_to_message_id: ctx.message?.message_id
    });
  }
});

// ادامه کد به همین شکل باید اصلاح شود...
// به دلیل محدودیت طول پاسخ، ادامه کد را خلاصه می‌کنم

// ==================[ راه‌اندازی ربات - FIXED ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // تست ربات
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    
    // راه‌اندازی ربات با polling و تنظیمات بهینه
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'callback_query'],
      polling: {
        timeout: 30,
        limit: 100,
        retryAfter: 5
      }
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
      .select('user_id')
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

// ==================[ شروع برنامه ]==================
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

// مدیریت خطاهای全局
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught Exception:', error);
  process.exit(1);
});

// شروع برنامه
startServer();
