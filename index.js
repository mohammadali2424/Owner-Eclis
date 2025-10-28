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

// ==================[ میدلور مدیریت خطاهای عمومی ]==================
bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error);
    
    // فقط به مالک پیام خطا نشان بده
    if (ctx.from && ctx.from.id === OWNER_ID) {
      await ctx.reply(`❌ خطا در پردازش دستور: ${error.message}`, {
        reply_to_message_id: ctx.message?.message_id
      });
    }
  }
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

// ==================[ بررسی نمادهای وفاداری ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined' || text === '') {
    return false;
  }
  
  const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
  const textStr = String(text).normalize();
  
  // بررسی مستقیم وجود نمادها
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      return true;
    }
  }
  
  // بررسی با regex برای اطمینان بیشتر
  const symbolRegex = /[꩘𖢻ꑭ𖮌]/u;
  return symbolRegex.test(textStr);
};

// ==================[ مدیریت چت‌های زیرمجموعه - کاملاً بازنویسی شده ]==================
const addChatToSubgroups = async (chatId, chatTitle, chatType, addedBy) => {
  try {
    console.log(`💾 افزودن ${chatType} به زیرمجموعه: ${chatTitle} (${chatId})`);
    
    const { error } = await supabase
      .from('eclis_subgroups')
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
      .from('eclis_subgroups')
      .delete()
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
      .from('eclis_subgroups')
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

// ==================[ کشف خودکار تمام چت‌هایی که ربات ادمین است - منطق کاملاً جدید ]==================
const discoverAdminChats = async (ctx) => {
  try {
    console.log('🔄 شروع کشف خودکار تمام چت‌هایی که ربات ادمین است...');
    
    const discoveredChats = [];
    const failedChats = [];
    
    // لیست چت‌های فعلی از دیتابیس
    const currentSubgroups = await getActiveSubgroups();
    const currentChatIds = currentSubgroups.map(chat => chat.chat_id);
    
    console.log(`📊 چت‌��ای فعلی در دیتابیس: ${currentChatIds.length}`);
    
    // اضافه کردن گروه اصلی به لیست بررسی اگر وجود دارد
    const chatsToCheck = [...currentChatIds];
    if (MAIN_GROUP_ID && !chatsToCheck.includes(MAIN_GROUP_ID)) {
      chatsToCheck.push(MAIN_GROUP_ID);
    }
    
    // بررسی هر چت برای وضعیت ادمین
    for (const chatId of chatsToCheck) {
      try {
        console.log(`🔍 بررسی چت: ${chatId}`);
        
        const chatInfo = await ctx.telegram.getChat(chatId);
        const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (chatMember && (chatMember.status === 'administrator' || chatMember.status === 'creator')) {
          const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chatInfo.title || 'بدون عنوان';
          
          discoveredChats.push({
            chat_id: chatId,
            chat_title: chatTitle,
            chat_type: chatType,
            status: chatMember.status
          });
          
          console.log(`✅ ربات در ${chatType} "${chatTitle}" ادمین است`);
        } else {
          console.log(`❌ ربات در چت ${chatId} ادمین نیست`);
          failedChats.push(chatId);
        }
        
        // تاخیر برای جلوگیری از محدودیت
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
        failedChats.push(chatId);
      }
    }
    
    // حذف چت‌هایی که ربات ادمین نیست
    for (const failedChatId of failedChats) {
      await removeChatFromSubgroups(failedChatId);
    }
    
    // اضافه کردن چت‌های جدید
    let newChatsAdded = 0;
    for (const chat of discoveredChats) {
      const isAlreadyInDb = currentChatIds.includes(chat.chat_id);
      if (!isAlreadyInDb) {
        const added = await addChatToSubgroups(chat.chat_id, chat.chat_title, chat.chat_type, OWNER_ID);
        if (added) {
          newChatsAdded++;
        }
      }
    }
    
    console.log(`✅ کشف چت‌ها کامل شد: ${discoveredChats.length} چت فعال, ${newChatsAdded} چت جدید, ${failedChats.length} چت حذف شده`);
    
    return { 
      success: true, 
      discovered: discoveredChats.length,
      newAdded: newChatsAdded,
      removed: failedChats.length,
      discoveredChats: discoveredChats,
      removedChats: failedChats
    };
    
  } catch (error) {
    console.log('❌ خطا در کشف چت‌های ادمین:', error.message);
    return { success: false, discovered: 0, newAdded: 0, removed: 0, discoveredChats: [], removedChats: [] };
  }
};

// ==================[ دستور جدید: بروزرسانی وضعیت چت‌ها ]==================
bot.command('update_chats', async (ctx) => {
  try {
    console.log('🔄 درخواست بروزرسانی وضعیت چت‌ها از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ارسال پیام موقت
    const tempMessage = await ctx.reply('🔄 در حال بروزرسانی وضعیت تمام گروه‌ها و کانال‌ها...\n\nاین عملیات ممکن است چند دقیقه طول بکشد.', {
      reply_to_message_id: ctx.message.message_id
    });
    
    const discoveryResult = await discoverAdminChats(ctx);
    
    if (!discoveryResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      return ctx.reply('❌ خطا در بروزرسانی وضعیت چت‌ها.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { discovered, newAdded, removed, discoveredChats, removedChats } = discoveryResult;
    
    let message = `🔄 بروزرسانی وضعیت چت‌ها\n\n`;
    message += `✅ عملیات با موفقیت انجام شد!\n\n`;
    message += `📊 نتایج:\n`;
    message += `• چت‌های فعال شناسایی شده: ${discovered}\n`;
    message += `• چت‌های جدید اضافه شده: ${newAdded}\n`;
    message += `• چت‌های غیرفعال حذف شده: ${removed}\n\n`;
    
    if (discoveredChats.length > 0) {
      message += `🏘️ چت‌های فعال (${discoveredChats.length}):\n`;
      discoveredChats.forEach((chat, index) => {
        const statusIcon = chat.status === 'creator' ? '👑' : '⚡';
        message += `${index + 1}. ${chat.chat_title} (${chat.chat_type}) ${statusIcon}\n`;
      });
      message += `\n`;
    }
    
    if (removedChats.length > 0) {
      message += `🗑️ چت‌های حذف شده (${removedChats.length}):\n`;
      message += `• ${removedChats.length} چت که ربات در آنها ادمین نیست حذف شدند\n\n`;
    }
    
    message += `💡 ربات اکنون فقط چت‌هایی که در آنها ادمین است را مدیریت می‌کند.`;

    // حذف پیام موقت و ارسال پیام اصلی
    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {
      console.log('⚠️ خطا در حذف پیام موقت:', e.message);
    }
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });
    
    console.log(`✅ بروزرسانی وضعیت چت‌ها کامل شد`);

  } catch (error) {
    console.log('❌ خطا در بروزرسانی وضعیت چت‌ها:', error.message);
    await ctx.reply('❌ خطا در بروزرسانی وضعیت چت‌ها.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ اسکن اعضای تمام چت‌های زیرمجموعه ]==================
const scanAllSubgroupsMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن اعضای تمام چت‌های زیرمجموعه...');
    
    const subgroups = await getActiveSubgroups();
    let totalMembersScanned = 0;
    let totalMembersSaved = 0;
    
    for (const subgroup of subgroups) {
      try {
        console.log(`🔍 اسکن ${subgroup.chat_type}: ${subgroup.chat_title}`);
        
        let members = [];
        
        if (subgroup.chat_type === 'کانال') {
          // برای کانال‌ها، فقط می‌توانیم مدیران را بررسی کنیم
          try {
            const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
            members = admins.map(admin => admin.user).filter(user => !user.is_bot);
            console.log(`👥 تعداد مدیران کانال: ${members.length}`);
          } catch (error) {
            console.log(`❌ خطا در دریافت مد��ران کانال:`, error.message);
          }
        } else {
          // برای گروه‌ها، مدیران را بررسی می‌کنیم
          try {
            const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
            members = admins.map(admin => admin.user).filter(user => !user.is_bot);
            console.log(`👥 تعداد مدیران گروه: ${members.length}`);
          } catch (error) {
            console.log(`❌ خطا در دریافت مدیران گروه:`, error.message);
          }
        }
        
        // ذخیره اعضا
        for (const member of members) {
          const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);
          
          const { error } = await supabase
            .from('eclis_members')
            .upsert({
              user_id: member.id,
              username: member.username || '',
              first_name: member.first_name || 'ناشناس',
              verified_by: OWNER_ID,
              verified_at: new Date().toISOString(),
              has_symbol: hasSymbol
            }, { onConflict: 'user_id' });

          if (!error) {
            totalMembersSaved++;
          }
          
          totalMembersScanned++;
          
          // تاخ��ر برای جلوگیری از محدودیت
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.log(`❌ خطا در اسکن ${subgroup.chat_type}:`, error.message);
      }
      
      // تاخیر بین اسکن چت‌های مختلف
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ اسکن اعضا کامل شد: ${totalMembersScanned} عضو اسکن شد, ${totalMembersSaved} عضو ذخیره/آپدیت شد`);
    return { success: true, scanned: totalMembersScanned, saved: totalMembersSaved };
    
  } catch (error) {
    console.log('❌ خطا در اسکن اعضای زیرمجموعه‌ها:', error.message);
    return { success: false, scanned: 0, saved: 0 };
  }
};

// ==================[ ذخیره کاربر تایید شده ]==================
const saveVerifiedUser = async (userId, username, firstName, verifiedBy) => {
  try {
    console.log(`💾 ذخیره کاربر تایید شده ${userId}...`);
    
    // بررسی نماد وفاداری
    const hasSymbol = checkLoyaltySymbols(firstName) || checkLoyaltySymbols(username);

    console.log(`🔍 نتیجه بررسی نماد برای ${firstName} (@${username}): ${hasSymbol}`);

    const { error } = await supabase
      .from('eclis_members')
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
      .from('eclis_members')
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
      .from('eclis_members')
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
      .from('eclis_members')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.log('❌ خطا در حذف کاربر از دیتابیس:', deleteError);
    }
    
    // ذخیره در جدول بن شده‌ها
    const { error } = await supabase
      .from('eclis_banned')
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
      .from('eclis_members')
      .select('user_id, username, first_name')
      .ilike('username', username)
      .single();

    if (error || !user) {
      console.log(`❌ کاربر @${username} در دیتابیس پیدا نشد`);
      return { success: false, banned: 0, failed: 0, message: 'کاربر در دیتابیس پیدا نشد' };
    }

    console.log(`✅ کاربر پیدا شد: ${user.first_name} (${user.user_id})`);
    
    // سپس کاربر را بن کن
    return await banUserFromEcosystem(user.user_id, user.username, user.first_name);
  } catch (error) {
    console.log('❌ خطا در بن کردن با نام کاربری:', error.message);
    return { success: false, banned: 0, failed: 0, message: error.message };
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

// دستور راهنما
bot.command('help', (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  const helpText = `🥷🏻 راهنمای ربات مدیریت اکلیس

📋 دستورات موجود:
/start - شروع ربات
/update_chats - بروزرسانی وضعیت گروه‌ها و کانال‌ها
/ban @username - بن کردن کاربر
/checkmembers - بررسی اعضای وفادار
/groups - لیست گروه‌ها
/status - وضعیت ربات
/help - این راهنما

💡 نکات:
- ربات فقط توسط مالک قابل استفاده است
- از /update_chats برای بروزرسانی وضعیت چت‌ها استفاده کنید
- ربات به صورت خودکار چت‌های جدید را شناسایی می‌کند`;

  ctx.reply(helpText, {
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
      await ctx.reply(`❌ ��طا در بن کردن کاربر @${targetUsername}\n\n${result.message || 'کاربر ممکن است در دیتابیس وجود نداشته باشد.'}`, {
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
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const processingMsg = await ctx.reply('🔍 در حال اسکن و بررسی اعضای تمام گروه‌ها و کانال‌های اکلیس...', {
      reply_to_message_id: ctx.message.message_id
    });

    // ابتدا وضعیت چت‌ها را بروزرسانی کن
    await discoverAdminChats(ctx);
    
    // سپس اسکن اعضا را انجام بده
    await scanAllSubgroupsMembers(ctx);
    
    // سپس اطلاعات را از دیتابیس می‌خ��انیم
    const { data: members, error } = await supabase
      .from('eclis_members')
      .select('user_id, username, first_name, has_symbol, verified_at');

    if (error) {
      console.log('❌ خطا در دریافت اعضا:', error);
      // حذف پیام موقت
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
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
      message += `آیا ${suspiciousUsers.length} عضو مشکوک توی کل اکوسیستم ��کلیس رو بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ آره، همه رو بکش', 'kill_suspicious')],
        [Markup.button.callback('❌ نه، بذار زنده باشن', 'dont_kill')]
      ]);

      // حذف پیام موقت و ارسال پیام اصلی
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      
      await ctx.reply(message, {
        ...keyboard,
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      message += `🎉 همه اعضا وفادار هستند! هیچ اقدام لازم نیست.`;
      
      // حذف پیام موقت و ارسال پیام اصلی
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      
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
      message += `💡 از دستور /update_chats برای بروزرسانی وضعیت چت‌ها استفاده کنید`;
    }
    
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
      .from('eclis_members')
      .select('user_id, has_symbol');

    const { data: banned, error: bannedError } = await supabase
      .from('eclis_banned')
      .select('user_id');

    const { data: subgroups, error: subgroupsError } = await supabase
      .from('eclis_subgroups')
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

// ==================[ مدیریت Callback Query ها ]==================

// کشتن کاربران مشکوک
bot.action('kill_suspicious', async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه');
      return;
    }

    await ctx.answerCbQuery('در حال بن کردن کاربران مشکوک...');
    
    const suspiciousUsers = await getSuspiciousUsers();
    let totalBanned = 0;
    let totalFailed = 0;

    for (const user of suspiciousUsers) {
      const result = await banUserFromEcosystem(user.user_id, user.username, user.first_name);
      if (result.success && result.banned > 0) {
        totalBanned++;
      } else {
        totalFailed++;
      }
      
      // تاخیر برای جلوگیری از محدودیت
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const message = `🗡️ عملیات کشتن کاربران مشکوک\n\n` +
      `✅ ${totalBanned} کاربر بن شد\n` +
      `❌ ${totalFailed} خطا در بن کردن`;

    await ctx.editMessageText(message);
    
  } catch (error) {
    console.log('❌ خطا در کشتن کاربران مشکوک:', error.message);
    await ctx.answerCbQuery('خطا در اجرای عملیات');
  }
});

// نکشتن کاربران مشکوک
bot.action('dont_kill', async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه');
      return;
    }

    await ctx.answerCbQuery('کاربران مشکوک بن نشدند');
    await ctx.editMessageText('✅ کاربران مشکوک بن نشدند و زنده ماندند.');
    
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error.message);
    await ctx.answerCbQuery('خطا در پردازش درخواست');
  }
});

// ==================[ راه‌اندازی ربات ]==================
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
        retryAfter: 5,
        allowedUpdates: ['message', 'chat_member', 'callback_query']
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
      .from('eclis_members')
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
