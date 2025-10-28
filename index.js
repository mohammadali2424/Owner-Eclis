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

// ==================[ بررسی نمادهای وفاداری - IMPROVED ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined' || text === '') {
    return false;
  }
  
  const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
  const textStr = String(text).normalize();
  
  console.log(`🔍 بررسی نماد در متن: "${textStr}"`);
  
  // بررسی مستقیم وجود نمادها
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      console.log(`✅ نماد "${symbol}" در متن پیدا شد`);
      return true;
    }
  }
  
  // بررسی با کد یونیکد
  for (const symbol of symbols) {
    const symbolCode = symbol.codePointAt(0).toString(16);
    for (let i = 0; i < textStr.length; i++) {
      const charCode = textStr.codePointAt(i).toString(16);
      if (charCode === symbolCode) {
        console.log(`✅ نماد با کد یونیکد ${symbolCode} پیدا شد`);
        return true;
      }
    }
  }
  
  console.log(`❌ هیچ نمادی در متن پیدا نشد`);
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
      console.log('❌ خطا در دریافت زیرگروه‌ها:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.log('❌ خطا در دریافت زیرگروه‌ها:', error.message);
    return [];
  }
};

// ==================[ تست اتصال دیتابیس ]==================
const testDatabaseConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('aklis_members')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ اتصال به دیتابیس موفق');
    return true;
  } catch (error) {
    console.log('❌ خطا در اتصال به دیتابیس:', error.message);
    return false;
  }
};

// ==================[ مدیریت اضافه شدن ربات به چت‌ها - FIXED ]==================
const handleBotAddedToChat = async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    const chatTitle = ctx.chat.title || 'بدون عنوان';
    const chatType = ctx.chat.type === 'channel' ? 'channel' : 'group';
    const addedBy = ctx.message.from.id;
    
    console.log(`🤖 ربات به ${chatType} "${chatTitle}" اضافه شد - توسط کاربر: ${addedBy}`);
    
    // بررسی مالکیت
    if (addedBy !== OWNER_ID) {
      console.log(`🚫 کاربر ${addedBy} مالک نیست - لفت دادن`);
      await ctx.reply('فقط آکی حق داره منو به گروه اضافه کنه', {
        reply_to_message_id: ctx.message.message_id
      });
      
      try {
        await ctx.leaveChat();
        console.log('✅ ربات از چت خارج شد');
      } catch (leaveError) {
        console.log('❌ خطا در خروج از چت:', leaveError.message);
      }
      return;
    }
    
    console.log(`✅ ربات توسط مالک اضافه شد - افزودن به زیرمجموعه`);
    
    // اضافه کردن به زیرمجموعه
    const added = await addChatToSubgroups(chatId, chatTitle, chatType, addedBy);
    
    if (added) {
      await ctx.reply('🥷🏻 نینجای اکلیس در خدمت شماست! این چت به زیرمجموعه‌های اکلیس اضافه شد.', {
        reply_to_message_id: ctx.message.message_id
      });
      
      // اطلاع به گروه اصلی
      await notifyMainGroupAboutNewChat(ctx, chatTitle, chatType, chatId);
    }
  } catch (error) {
    console.log('❌ خطا در پردازش اضافه شدن ربات:', error.message);
  }
};

// ==================[ اطلاع به گروه اصلی درباره چت جدید ]==================
const notifyMainGroupAboutNewChat = async (ctx, chatTitle, chatType, chatId) => {
  try {
    if (MAIN_GROUP_ID && ctx.chat.id.toString() !== MAIN_GROUP_ID) {
      const now = new Date();
      const timeString = now.toLocaleTimeString('fa-IR', { 
        hour: '2-digit', 
        minute: '2-digit'
      });
      
      const alertMessage = `✅ چت جدید به اکوسیستم اضافه شد\n\n` +
        `🏷️ نام: ${chatTitle}\n` +
        `📝 نوع: ${chatType}\n` +
        `🆔 آیدی: ${chatId}\n` +
        `🕒 زمان: ${timeString}\n\n` +
        `👑 [آکی](tg://user?id=${OWNER_ID})`;
        
      await bot.telegram.sendMessage(
        MAIN_GROUP_ID, 
        alertMessage,
        { 
          parse_mode: 'Markdown'
        }
      );
      console.log('✅ اطلاع‌رسانی به گروه اصلی ارسال شد');
    }
  } catch (error) {
    console.log('❌ خطا در اطلاع‌رسانی به گروه اصلی:', error.message);
  }
};

// ==================[ ذخیره کاربر تایید شده ]==================
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    
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

// ==================[ اسکن و ذخیره تمام اعضای گروه ]==================
const scanAndSaveAllMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن تمام اعضای گروه...');
    
    const chatId = ctx.chat.id.toString();
    
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

          if (error) {
            console.log(`❌ خطا در ذخیره کاربر ${user.first_name}:`, error);
          } else {
            savedCount++;
          }
        }
        
        // تاخیر برای جلوگیری از محدودیت
        await new Promise(resolve => setTimeout(resolve, 100));
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

// ==================[ بن کردن کاربر از کل اکوسیستم ]==================
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
        await bot.telegram.banChatMember(subgroup.chat_id, userId);
        console.log(`✅ کاربر از ${subgroup.chat_type} "${subgroup.chat_title}" بن شد`);
        totalBanned++;
        
        // تاخیر برای جلوگیری از محدودیت تلگرام
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

// ==================[ بررسی وضعیت چت‌های زیرمجموعه ]==================
const checkSubgroupsStatus = async (ctx) => {
  try {
    console.log('🔍 بررسی وضعیت چت‌های زیرمجموعه...');
    
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
      removedGroups: removedGroups,
      totalChecked: subgroups.length
    };
    
  } catch (error) {
    console.log('❌ خطا در بررسی وضعیت چت‌ها:', error.message);
    return { success: false, activeSubgroups: [], removedGroups: [], totalChecked: 0 };
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

// ==================[ مدیریت اعضای جدید در گروه‌ها ]==================
const handleNewUserInChat = async (ctx, member, isMainGroup) => {
  try {
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

      await ctx.reply(requestMessage, {
        ...keyboard,
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      // در زیرگروه - بررسی تایید کاربر
      console.log(`🔍 بررسی تایید کاربر برای زیرگروه...`);
      
      const isVerified = await isUserVerified(userId);
      
      if (!isVerified) {
        console.log(`🚫 کاربر تایید نشده - بن کردن`);
        
        try {
          await ctx.banChatMember(userId);
          console.log(`✅ کاربر از زیرگروه بن شد`);
          
          // اطلاع به گروه اصلی با تگ مالک
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
              `📍 گروه: ${ctx.chat.title || 'بدون عنوان'}\n\n` +
              `👑 [آکی](tg://user?id=${OWNER_ID})`;
              
            await bot.telegram.sendMessage(
              MAIN_GROUP_ID, 
              alertMessage,
              { 
                parse_mode: 'Markdown'
              }
            );
          }
        } catch (banError) {
          console.log('❌ خطا در بن کردن کاربر:', banError.message);
        }
      } else {
        console.log(`✅ کاربر تایید شده - اجازه ورود`);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش کاربر جدید:', error.message);
  }
};

// ==================[ دستورات ]==================

// دکمه استارت
bot.start((ctx) => {
  console.log('🎯 دستور استارت از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
  
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  return ctx.reply('نینجای شماره چهار در خدمت شماست', {
    reply_to_message_id: ctx.message.message_id
  });
});

// دستور بن کردن کاربر
bot.command('ban', async (ctx) => {
  try {
    console.log('⚠️ درخواست بن از:', ctx.from?.first_name, 'آیدی:', ctx.from?.id);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ لطفاً آیدی کاربر را وارد کنید.\n\nمثال:\n`/ban @username`', { 
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
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
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await ctx.reply(`❌ خطا در بن کردن کاربر @${targetUsername}\n\nکاربر ممکن است در دیتابیس وجود نداشته باشد.`, {
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.log('❌ خطا در اجرای دستور ban:', error.message);
    await ctx.reply('❌ خطا در اجرای دستور ban', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// دستور بررسی اعضای اکلیس
bot.command('checkmembers', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی اعضا از:', ctx.from?.first_name);
    
    // بررسی اینکه دستور فقط در گروه اصلی اجرا شود
    const chatId = ctx.chat.id.toString();
    if (MAIN_GROUP_ID && chatId !== MAIN_GROUP_ID) {
      return ctx.reply('این دستور فقط در گروه اصلی قابل استفاده است.', {
        reply_to_message_id: ctx.message.message_id
      });
    }
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const processingMsg = await ctx.reply('🔍 در حال اسکن و بررسی اعضای اکلیس...', {
      reply_to_message_id: ctx.message.message_id
    });

    // حذف پیام موقت بعد از 3 ثانیه
    deleteMessageAfterDelay(ctx, processingMsg.message_id, 3000);
    
    // ابتدا یک اسکن سریع انجام می‌دهیم
    await scanAndSaveAllMembers(ctx);
    
    // سپس اطلاعات را از دیتابیس می‌خوانیم
    const { data: members, error } = await supabase
      .from('aklis_members')
      .select('user_id, username, first_name, has_symbol, verified_at');

    if (error) {
      console.log('❌ خطا در دریافت اعضا:', error);
      return ctx.reply('❌ خطا در دریافت اطلاعات اعضا از دیتابیس.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    console.log(`📊 تعداد کل اعضا از دیتابیس: ${members?.length || 0}`);
    
    const loyalUsers = members?.filter(m => m.has_symbol) || [];
    const suspiciousUsers = members?.filter(m => !m.has_symbol) || [];

    console.log(`📊 وفادار: ${loyalUsers.length}, مشکوک: ${suspiciousUsers.length}`);

    let message = `🏰 بررسی اعضای اکلیس\n\n`;
    message += `✅ اعضای وفادار: ${loyalUsers.length} نفر\n`;
    message += `⚠️ اعضای مشکوک: ${suspiciousUsers.length} نفر\n\n`;

    if (suspiciousUsers.length > 0) {
      message += `آیا ${suspiciousUsers.length} عضو مشکوک توی کل اکوسیستم اکلیس رو بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ آره', 'kill_suspicious')],
        [Markup.button.callback('❌ نه', 'dont_kill')]
      ]);

      await ctx.reply(message, {
        ...keyboard,
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      message += `🎉 همه اعضا وفادار هستند! هیچ اقدام لازم نیست.`;
      await ctx.reply(message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.log('❌ خطا در بررسی اعضا:', error.message);
    await ctx.reply('❌ خطا در بررسی اعضا.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// دستور بررسی وضعیت گروه‌ها
bot.command('check', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی وضعیت گروه‌ها از:', ctx.from?.first_name);
    
    // بررسی اینکه دستور فقط در گروه اصلی اجرا شود
    const chatId = ctx.chat.id.toString();
    if (MAIN_GROUP_ID && chatId !== MAIN_GROUP_ID) {
      return ctx.reply('این دستور فقط در گروه اصلی قابل استفاده است.', {
        reply_to_message_id: ctx.message.message_id
      });
    }
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ارسال پیام موقت و ذخیره آن
    const tempMessage = await ctx.reply('🔍 در حال بررسی وضعیت گروه‌ها و کانال‌های زیرمجموعه...', {
      reply_to_message_id: ctx.message.message_id
    });
    
    const checkResult = await checkSubgroupsStatus(ctx);
    
    if (!checkResult.success) {
      // حذف پیام موقت در صورت خطا
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      return ctx.reply('❌ خطا در بررسی وضعیت گروه‌ها.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { activeSubgroups, removedGroups, totalChecked } = checkResult;
    
    let message = `🔄 بروزرسانی وضعیت گروه‌های زیرمجموعه\n\n`;
    
    if (removedGroups.length > 0) {
      message += `❌ ${removedGroups.length} گروه/کانال غیرفعال شدند:\n`;
      removedGroups.forEach((group, index) => {
        message += `${index + 1}. ${group.chat_title} (${group.chat_type})\n`;
      });
      message += `\n`;
    }
    
    if (removedGroups.length === 0) {
      message += `✅ همه گروه‌ها و کانال‌ها در امان هستند!\n\n`;
    }
    
    message += `📊 آمار نهایی:\n`;
    message += `• گروه/کانال‌های فعال: ${activeSubgroups.length}\n`;
    message += `• گروه/کانال‌های حذف شده: ${removedGroups.length}\n`;
    message += `• کل چت‌های بررسی شده: ${totalChecked}\n\n`;
    
    message += `🏠 گروه اصلی: ${MAIN_GROUP_ID ? 'متصل ✅' : 'تنظیم نشده ❌'}\n\n`;
    
    message += `🔄 ربات به طور خودکار گروه‌هایی که ادمین شده را به زیرمجموعه اضافه می‌کند`;

    // حذف پیام موقت و ارسال پیام اصلی
    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {
      console.log('⚠️ خطا در حذف پیام موقت:', e.message);
    }
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });
    
    console.log(`✅ بررسی وضعیت گروه‌ها کامل شد: ${activeSubgroups.length} فعال`);

  } catch (error) {
    console.log('❌ خطا در بررسی وضعیت گروه‌ها:', error.message);
    await ctx.reply('❌ خطا در بررسی وضعیت گروه‌ها.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// مشاهده لیست گروه‌ها
bot.command('groups', async (ctx) => {
  try {
    console.log('📋 درخواست لیست گروه‌ها از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const subgroups = await getActiveSubgroups();
    
    let message = `🏘️ لیست گروه‌ها و کانال‌های اکلیس\n\n`;
    
    if (MAIN_GROUP_ID) {
      message += `🏠 گروه اصلی: تنظیم شده ✅\n`;
      message += `🆔: ${MAIN_GROUP_ID}\n\n`;
    } else {
      message += `🏠 گروه اصلی: تنظیم نشده ❌\n\n`;
    }
    
    message += `📊 زیرمجموعه‌های فعال: ${subgroups.length}\n\n`;
    
    if (subgroups.length > 0) {
      subgroups.forEach((subgroup, index) => {
        message += `${index + 1}. ${subgroup.chat_title}\n`;
        message += `   📝 نوع: ${subgroup.chat_type}\n`;
        message += `   🆔: ${subgroup.chat_id}\n\n`;
      });
    } else {
      message += `📭 هیچ زیرمجموعه‌ای وجود ندارد\n\n`;
    }
    
    message += `✅ ربات به صورت خودکار چت‌هایی که ادمین میشود را به زیرمجموعه اضافه میکند`;
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.log('❌ خطا در دریافت لیست گروه‌ها:', error.message);
    await ctx.reply('❌ خطا در دریافت لیست گروه‌ها.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// وضعیت ربات
bot.command('status', async (ctx) => {
  try {
    console.log('📈 درخواست وضعیت از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { data: members, error: membersError } = await supabase
      .from('aklis_members')
      .select('user_id, has_symbol');

    const { data: banned, error: bannedError } = await supabase
      .from('aklis_banned')
      .select('user_id');

    const { data: subgroups, error: subgroupsError } = await supabase
      .from('aklis_subgroups')
      .select('chat_id')
      .eq('is_active', true);

    const totalMembers = members && !membersError ? members.length : 0;
    const loyalMembers = members && !membersError ? members.filter(m => m.has_symbol).length : 0;
    const suspiciousMembers = members && !membersError ? members.filter(m => !m.has_symbol).length : 0;
    const totalBanned = banned && !bannedError ? banned.length : 0;
    const totalSubgroups = subgroups && !subgroupsError ? subgroups.length : 0;

    let statusMessage = `🥷🏻 وضعیت ربات اکلیس\n\n`;
    statusMessage += `🔹 کل اعضای تایید شده: ${totalMembers}\n`;
    statusMessage += `🔹 اعضای وفادار: ${loyalMembers}\n`;
    statusMessage += `🔹 اعضای مشکوک: ${suspiciousMembers}\n`;
    statusMessage += `🔹 کاربران بن شده: ${totalBanned}\n`;
    statusMessage += `🔹 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده ✅' : 'تنظیم نشده ❌'}\n`;
    statusMessage += `🔹 زیرمجموعه‌های فعال: ${totalSubgroups}\n`;
    statusMessage += `🔹 وضعیت دیتابیس: ${membersError ? 'قطع ❌' : 'متصل ✅'}\n`;
    statusMessage += `🔹 وضعیت ربات: فعال ✅\n\n`;

    console.log(`📊 آمار: ${totalMembers} عضو, ${loyalMembers} وفادار, ${suspiciousMembers} مشکوک, ${totalBanned} بن شده, ${totalSubgroups} زیرمجموعه`);
    await ctx.reply(statusMessage, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.log('❌ خطا در دریافت وضعیت:', error.message);
    await ctx.reply('❌ خطا در دریافت وضعیت ربات.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ مدیریت رویدادها - FIXED ]==================

// مدیریت اضافه شدن ربات به چت‌ها - این بخش مشکل داشت
bot.on('new_chat_members', async (ctx) => {
  try {
    console.log('👥 تشخیص اعضای جدید در چت:', ctx.chat.title, 'آیدی:', ctx.chat.id);
    
    for (const member of ctx.message.new_chat_members) {
      console.log(`🔍 بررسی عضو: ${member.first_name} (${member.id}) - بات: ${member.is_bot}`);
      
      if (member.is_bot && member.username === SELF_BOT_ID) {
        console.log(`✅ ربات خودمان اضافه شده است`);
        await handleBotAddedToChat(ctx);
        return;
      }

      // اگر کاربر عادی اضافه شده باشد
      if (!member.is_bot) {
        const chatId = ctx.chat.id.toString();
        const isMainGroup = MAIN_GROUP_ID && chatId === MAIN_GROUP_ID;
        await handleNewUserInChat(ctx, member, isMainGroup);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش عضو جدید:', error.message);
  }
});

// مدیریت حذف ربات از چت‌ها
bot.on('left_chat_member', async (ctx) => {
  try {
    const leftMember = ctx.message.left_chat_member;
    
    if (leftMember.is_bot && leftMember.username === SELF_BOT_ID) {
      const chatId = ctx.chat.id.toString();
      const chatTitle = ctx.chat.title || 'بدون عنوان';
      
      console.log(`🚪 ربات از ${chatTitle} حذف شد`);
      
      // حذف از زیرمجموعه‌ها
      await removeChatFromSubgroups(chatId);
      
      console.log(`✅ چت از زیرمجموعه‌ها حذف شد`);
    }
  } catch (error) {
    console.log('❌ خطا در پردازش حذف ربات:', error.message);
  }
});

// مدیریت خروج کاربران از گروه اصلی
bot.on('left_chat_member', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    
    // فقط در گروه اصلی پردازش شود
    if (!MAIN_GROUP_ID || chatId !== MAIN_GROUP_ID) {
      return;
    }
    
    const leftMember = ctx.message.left_chat_member;
    
    // اگر کاربر ربات باشد یا مالک باشد، پردازش نکن
    if (leftMember.is_bot || leftMember.id === OWNER_ID) {
      return;
    }
    
    console.log(`🚪 کاربر از گروه اصلی خارج شد: ${leftMember.first_name} (${leftMember.id})`);
    
    // بن کردن کاربر از کل اکوسیستم
    const result = await banUserFromEcosystem(leftMember.id, leftMember.username, leftMember.first_name);
    
    if (result.success && result.banned > 0) {
      console.log(`✅ کاربر ${leftMember.first_name} از ${result.banned} چت بن شد`);
      
      const now = new Date();
      const timeString = now.toLocaleTimeString('fa-IR', { 
        hour: '2-digit', 
        minute: '2-digit'
      });
      
      const alertMessage = `🚨 کاربر از گروه اصلی خارج شد و از کل اکوسیستم بن شد\n\n` +
        `👤 نام: ${leftMember.first_name}\n` +
        `🆔 آیدی: ${leftMember.id}\n` +
        `📝 نام کاربری: @${leftMember.username || 'ندارد'}\n` +
        `🔫 بن شده از: ${result.banned} چت\n` +
        `🕒 زمان: ${timeString}\n\n` +
        `👑 [آکی](tg://user?id=${OWNER_ID})`;
        
      await ctx.reply(alertMessage, {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      console.log(`❌ خطا در بن کردن کاربر ${leftMember.first_name}`);
    }
    
  } catch (error) {
    console.log('❌ خطا در پردازش خروج کاربر:', error.message);
  }
});

// ==================[ پردازش پیام‌های عادی ]==================
bot.on('message', async (ctx) => {
  try {
    // فقط پیام‌های گروهی پردازش ش��ند
    if (ctx.chat.type === 'private') return;
    
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from?.id;
    const isMainGroup = MAIN_GROUP_ID && chatId === MAIN_GROUP_ID;
    
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
        deleteMessageAfterDelay(ctx, warning.message_id, 5000);
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
    // بررسی مالکیت
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

    const userId = parseInt(ctx.match[1]);
    const targetUser = ctx.callbackQuery.message?.reply_to_message?.new_chat_members?.[0] || 
                      { first_name: 'کاربر', username: '' };
    
    console.log(`✅ تایید کاربر ${userId} توسط مالک`);
    
    await saveVerifiedUser(userId, targetUser.username, targetUser.first_name, ctx.from.id);
    
    const welcomeMessage = `👤 ${targetUser.first_name}\n` +
      `خوش اومدی به جهان بزرگ اکلیس 🎉`;
    
    await ctx.editMessageText(welcomeMessage);
    await ctx.answerCbQuery('کاربر تایید شد');
    console.log(`✅ کاربر ${targetUser.first_name} تایید شد`);
    
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    // بررسی مالکیت
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

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
    await ctx.answerCbQuery('کاربر رد و حذف شد');
    console.log(`✅ کاربر ${targetUser.first_name} رد و حذف شد`);
    
  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('❌ خطا در رد کاربر');
  }
});

bot.action('kill_suspicious', async (ctx) => {
  try {
    // بررسی مالکیت
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

    console.log('🔫 بن کردن اعضای مشکوک از کل اکوسیستم توسط مالک');
    
    await ctx.editMessageText('🔫 در حال بن کردن اعضای مشکوک از کل اکوسیستم...');
    
    const suspiciousUsers = await getSuspiciousUsers();
    
    if (suspiciousUsers.length === 0) {
      await ctx.editMessageText('✅ هیچ کاربر مشکوکی برای بن کردن وجود ندارد');
      return;
    }

    let totalBanned = 0;
    let totalFailed = 0;
    
    // بن کردن واقعی کاربران مشکوک از کل اکوسیستم
    for (const user of suspiciousUsers) {
      console.log(`🔫 در حال بن کردن کاربر از کل اکوسیستم: ${user.first_name} (${user.user_id})`);
      
      const result = await banUserFromEcosystem(user.user_id, user.username, user.first_name);
      if (result.success) {
        totalBanned += result.banned;
        totalFailed += result.failed;
      } else {
        totalFailed++;
      }
      
      // تاخیر بین بن کردن کاربران برای جلوگیری از محدودیت تلگرام
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // نمایش نتیجه
    let resultMessage = `با نهایت خوشحالی و لذت همشون کشته شدن\n\n`;
    resultMessage += `🔫 تعداد کاربران مشکوک: ${suspiciousUsers.length} نفر\n`;
    resultMessage += `✅ بن موفق از ${totalBanned} چت\n`;
    resultMessage += `❌ خطا در بن: ${totalFailed} چت\n\n`;
    
    if (totalBanned > 0) {
      resultMessage += `🎯 ${suspiciousUsers.length} کاربر مشکوک با موفقیت از کل اکوسیستم حذف شدند`;
    } else {
      resultMessage += `⚠️ هیچ کاربری بن نشد`;
    }
    
    await ctx.editMessageText(resultMessage);
    console.log(`✅ ${suspiciousUsers.length} کاربر مشکوک از کل اکوسیستم بن شدند`);
    
  } catch (error) {
    console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
    await ctx.editMessageText('❌ خطا در بن کردن اعضای مشکوک');
  }
});

bot.action('dont_kill', async (ctx) => {
  try {
    // بررسی مالکیت
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

    await ctx.editMessageText('فرصتی دوباره برای زندگی...');
    console.log('❌ بن کردن اعضای مشکوک توسط مالک لغو شد');
  } catch (error) {
    console.log('❌ خطا در لغو:', error.message);
  }
});

// ==================[ راه‌اندازی ربات ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // تست اتصال دیتابیس
    await testDatabaseConnection();
    
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
        retryAfter: 5,
        allowedUpdates: ['message', 'chat_member', 'callback_query']
      }
    });
    
    console.log('✅ ربات با موفقیت راه‌اندازی شد');
    console.log('🥷🏻 ربات آماده خدمت‌رسانی است');
    
    // فعال کردن graceful stop
    process.once('SIGINT', () => {
      console.log('🛑 دریاف�� SIGINT - خاموش کردن ربات...');
      bot.stop('SIGINT');
    });
    
    process.once('SIGTERM', () => {
      console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
      bot.stop('SIGTERM');
    });
    
  } catch (error) {
    if (error.message.includes('409: Conflict')) {
      console.log('❌ خطای 409: احتمالاً یک نمونه دیگر از ربات در حال اجراست');
      console.log('💡 راه حل: مطمئن شوید فقط یک نمونه از ربات اجرا می‌شود');
      console.log('💡 اگر روی Render هستید، مطمئن شوید instance اضافی ندارید');
    } else {
      console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    }
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

// ==================[ مدیریت خطاهای全局 ]==================
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught Exception:', error);
  process.exit(1);
});

// شروع برنامه
startServer();
