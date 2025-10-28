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

// ==================[ بررسی نمادهای وفاداری ]==================
const checkLoyaltySymbols = (text) => {
  if (!text || text === 'null' || text === 'undefined' || text === '') {
    return false;
  }
  
  const symbols = ['꩘', '𖢻', 'ꑭ', '𖮌'];
  const textStr = String(text);
  
  // بررسی مستقیم وجود نمادها
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      console.log(`✅ نماد "${symbol}" در متن پیدا شد`);
      return true;
    }
  }
  
  console.log(`❌ هیچ نمادی در متن "${textStr}" پیدا نشد`);
  return false;
};

// ==================[ مدیریت چت‌های زیرمجموعه ]==================
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

// ==================[ اسکن و اضافه کردن تمام چت‌هایی که ربات ادمین است - FIXED ]==================
const scanAndAddAllAdminChats = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن تمام چت‌هایی که ربات ادمین است...');
    
    let newChatsAdded = 0;
    let totalChatsChecked = 0;
    let foundChats = [];
    
    // ابتدا چت‌های موجود در دیتابیس را بررسی می‌کنیم
    const existingChats = await getActiveSubgroups();
    console.log(`📋 ${existingChats.length} چت موجود در دیتابیس پیدا شد`);
    
    // اضافه کردن گروه اصلی به لیست بررسی اگر وجود دارد
    const chatsToCheck = [...existingChats];
    if (MAIN_GROUP_ID && !existingChats.find(chat => chat.chat_id === MAIN_GROUP_ID)) {
      chatsToCheck.push({
        chat_id: MAIN_GROUP_ID,
        chat_title: 'گروه اصلی',
        chat_type: 'گروه'
      });
    }
    
    console.log(`🔍 بررسی ${chatsToCheck.length} چت برای وضعیت ادمین...`);
    
    // بررسی هر چت
    for (const chat of chatsToCheck) {
      try {
        console.log(`🔍 بررسی چت: ${chat.chat_id} - ${chat.chat_title}`);
        
        // دریافت اطلاعات چت
        const chatInfo = await ctx.telegram.getChat(chat.chat_id);
        const chatMember = await ctx.telegram.getChatMember(chat.chat_id, bot.botInfo.id);
        
        console.log(`📊 وضعیت ربات در چت: ${chatMember.status}`);
        
        if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
          // شناسایی دقیق نوع چت
          let chatType = 'گروه';
          if (chatInfo.type === 'channel') {
            chatType = 'کانال';
          }
          
          const chatTitle = chatInfo.title || 'بدون عنوان';
          
          foundChats.push({
            chat_id: chat.chat_id,
            chat_title: chatTitle,
            chat_type: chatType,
            status: chatMember.status
          });
          
          console.log(`✅ ربات در ${chatType} "${chatTitle}" ادمین است`);
          
          // اضافه کردن یا به‌روزرسانی چت در دیتابیس
          const added = await addChatToSubgroups(chat.chat_id, chatTitle, chatType, OWNER_ID);
          if (added) {
            newChatsAdded++;
          }
        } else {
          console.log(`❌ ربات در چت ${chat.chat_title} ادمین نیست (وضعیت: ${chatMember.status})`);
        }
        
        totalChatsChecked++;
        
        // تاخیر برای جلوگیری از محدودیت
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`❌ خطا در بررسی چت ${chat.chat_id}:`, error.message);
        
        // اگر خطا داد، احتمالاً ربات دیگر در چت نیست یا دسترسی ندارد
        await removeChatFromSubgroups(chat.chat_id);
      }
    }
    
    console.log(`✅ اسکن کامل شد: ${totalChatsChecked} چت بررسی شد, ${newChatsAdded} چت جدید/آپدیت شد`);
    
    return { 
      success: true, 
      totalChecked: totalChatsChecked, 
      newAdded: newChatsAdded,
      foundChats: foundChats
    };
    
  } catch (error) {
    console.log('❌ خطا در اسکن چت‌های ادمین:', error.message);
    return { success: false, totalChecked: 0, newAdded: 0, foundChats: [] };
  }
};

// ==================[ اسکن اعضای تمام چت‌های زیرمجموعه - FIXED ]==================
const scanAllSubgroupsMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن اعضای تمام چت‌های زیرمجموعه...');
    
    const subgroups = await getActiveSubgroups();
    let totalMembersScanned = 0;
    let totalMembersSaved = 0;
    
    console.log(`🔍 اسکن ${subgroups.length} زیرمجموعه برای اعضا...`);
    
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
            console.log(`❌ خطا در دریافت مدیران کانال ${subgroup.chat_title}:`, error.message);
          }
        } else {
          // برای گروه‌ها، مدیران را بررسی می‌کنیم
          try {
            const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
            members = admins.map(admin => admin.user).filter(user => !user.is_bot);
            console.log(`👥 تعداد مدیران گروه: ${members.length}`);
          } catch (error) {
            console.log(`❌ خطا در دریافت مدیران گروه ${subgroup.chat_title}:`, error.message);
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
          
          // تاخیر برای جلوگیری از محدودیت
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.log(`❌ خطا در اسکن ${subgroup.chat_type} ${subgroup.chat_title}:`, error.message);
      }
      
      // تاخیر بین اسکن چت‌های مختلف
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ اسکن اعضا کامل شد: ${totalMembersScanned} عضو اسکن شد, ${totalMembersSaved} عضو ذخیره/آپدیت شد`);
    return { success: true, scanned: totalMembersScanned, saved: totalMembersSaved };
    
  } catch (error) {
    console.log('❌ خطا در اسکن اعضای زیرمجموعه‌ها:', error.message);
    return { success: false, scanned: 0, saved: 0 };
  }
};

// ==================[ دستور اضافه کردن گروه دستی ]==================
const manuallyAddGroup = async (ctx, chatId, chatTitle) => {
  try {
    console.log(`➕ افزودن دستی گروه: ${chatTitle} (${chatId})`);
    
    // بررسی وضعیت ربات در چت
    const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
    const chatInfo = await ctx.telegram.getChat(chatId);
    
    let chatType = 'گروه';
    if (chatInfo.type === 'channel') {
      chatType = 'کانال';
    }
    
    if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
      const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
      
      if (added) {
        await ctx.reply(`✅ ${chatType} "${chatTitle}" با موفقیت به زیرمجموعه اضافه شد`, {
          reply_to_message_id: ctx.message.message_id
        });
        return true;
      } else {
        await ctx.reply(`❌ خطا در اضافه کردن ${chatType} به دیتابیس`, {
          reply_to_message_id: ctx.message.message_id
        });
        return false;
      }
    } else {
      await ctx.reply(`❌ ربات در این ${chatType} ادمین نیست. لطفاً ابتدا ربات را ادمین کنید.`, {
        reply_to_message_id: ctx.message.message_id
      });
      return false;
    }
    
  } catch (error) {
    console.log('❌ خطا در افزودن دستی گروه:', error.message);
    await ctx.reply(`❌ خطا در افزودن گروه: ${error.message}`, {
      reply_to_message_id: ctx.message.message_id
    });
    return false;
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

// دستور اسکن چت‌های ادمین - FIXED
bot.command('scan', async (ctx) => {
  try {
    console.log('🔍 درخواست اسکن چت‌های ادمین از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    // ارسال پیام موقت
    const tempMessage = await ctx.reply('🔍 در حال اسکن تمام چت‌هایی که ربات ادمین است...', {
      reply_to_message_id: ctx.message.message_id
    });
    
    const scanResult = await scanAndAddAllAdminChats(ctx);
    
    if (!scanResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      return ctx.reply('❌ خطا در اسکن چت‌های ادمین.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { totalChecked, newAdded, foundChats } = scanResult;
    
    let message = `🔄 اسکن چت‌های ادمین\n\n`;
    message += `✅ اسکن کامل شد!\n\n`;
    message += `📊 نتایج:\n`;
    message += `• چت‌های بررسی شده: ${totalChecked}\n`;
    message += `• چت‌های جدید/آپدیت شده: ${newAdded}\n`;
    message += `• چت‌های فعال پیدا شده: ${foundChats.length}\n\n`;
    
    if (foundChats.length > 0) {
      message += `📋 لیست چت‌های فعال:\n`;
      foundChats.forEach((chat, index) => {
        message += `${index + 1}. ${chat.chat_title} (${chat.chat_type}) - وضعیت: ${chat.status}\n`;
      });
      message += `\n`;
    } else {
      message += `📭 هیچ چت فعالی پیدا نشد\n\n`;
      message += `💡 برای اضافه کردن دستی گروه‌ها از دستور /addgroup استفاده کنید\n`;
    }
    
    message += `💡 ربات اکنون ${foundChats.length} چت فعال را مدیریت می‌کند.`;

    // حذف پیام موقت و ارسال پیام اصلی
    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {
      console.log('⚠️ خطا در حذف پیام موقت:', e.message);
    }
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });
    
    console.log(`✅ اسکن چت‌های ادمین کامل شد: ${foundChats.length} چت فعال پیدا شد`);

  } catch (error) {
    console.log('❌ خطا در اسکن چت‌های ادمین:', error.message);
    await ctx.reply('❌ خطا در اسکن چت‌های ادمین.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
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
        `📋 از ${result.banned} گروه/کانال بن شد\n` +
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
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const processingMsg = await ctx.reply('🔍 در حال اسکن و بررسی اعضای تمام گروه‌ها و کانال‌های اکلیس...', {
      reply_to_message_id: ctx.message.message_id
    });

    // اسکن تمام چت‌های زیرمجموعه و اعضای آنها
    await scanAllSubgroupsMembers(ctx);
    
    // سپس اطلاعات را از دیتابیس می‌خوانیم
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
      message += `آیا ${suspiciousUsers.length} عضو مشکوک توی کل اکوسیستم اکلیس رو بکشم ؟`;
      
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

// دستور بررسی وضعیت گروه‌ها
bot.command('check', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی وضعیت گروه‌ها از:', ctx.from?.first_name);
    
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
    
    // ابتدا اسکن چت‌های ادمین را انجام می‌دهیم
    const scanResult = await scanAndAddAllAdminChats(ctx);
    
    const subgroups = await getActiveSubgroups();
    
    let message = `🔄 بروزرسانی وضعیت گروه‌های زیرمجموعه\n\n`;
    
    if (scanResult.newAdded > 0) {
      message += `✅ ${scanResult.newAdded} گروه/کانال جدید شناسایی و اضافه شدند\n\n`;
    }
    
    // نمایش لیست گروه‌ها و کانال‌های فعال
    if (subgroups.length > 0) {
      message += `📋 لیست گروه‌ها و کانال‌های فعال:\n`;
      subgroups.forEach((subgroup, index) => {
        message += `${index + 1}. ${subgroup.chat_title} (${subgroup.chat_type})\n`;
      });
      message += `\n`;
    } else {
      message += `📭 هیچ گروه یا کانال فعالی پیدا نشد\n\n`;
    }
    
    message += `📊 آمار نهایی:\n`;
    message += `• گروه/کانال‌های فعال: ${subgroups.length}\n`;
    message += `• گروه/کانال‌های جدید: ${scanResult.newAdded}\n`;
    message += `• کل چت‌های بررسی شده: ${scanResult.totalChecked}\n\n`;
    
    message += `🏠 گروه اصلی: ${MAIN_GROUP_ID ? 'متصل ✅' : 'تنظیم نشده ❌'}\n\n`;
    
    message += `💡 برای اضافه کردن دستی گروه‌ها از دستور /addgroup استفاده کنید`;

    // حذف پیام موقت و ارسال پیام اصلی
    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {
      console.log('⚠️ خطا در حذف پیام موقت:', e.message);
    }
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });
    
    console.log(`✅ بررسی وضعیت گروه‌ها کامل شد: ${subgroups.length} فعال`);

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
      message += `💡 برای اضافه کردن گروه‌ها:\n`;
      message += `1. ربات را به گروه اضافه کنید\n`;
      message += `2. ربات را ادمین کنید\n`;
      message += `3. از دستور /addgroup در آن گروه استفاده کنید\n`;
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

// دستور اضافه کردن گروه دستی
bot.command('addgroup', async (ctx) => {
  try {
    console.log('➕ درخواست افزودن گروه دستی از:', ctx.from?.first_name);
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const chatId = ctx.chat.id.toString();
    const chatTitle = ctx.chat.title || 'بدون عنوان';
    
    console.log(`➕ افزودن گروه: ${chatTitle} (${chatId})`);
    
    await manuallyAddGroup(ctx, chatId, chatTitle);

  } catch (error) {
    console.log('❌ خطا در افزودن گروه دستی:', error.message);
    await ctx.reply('❌ خطا در افزودن گروه دستی.', {
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
      .select('chat_id, chat_type')
      .eq('is_active', true);

    const totalMembers = members && !membersError ? members.length : 0;
    const loyalMembers = members && !membersError ? members.filter(m => m.has_symbol).length : 0;
    const suspiciousMembers = members && !membersError ? members.filter(m => !m.has_symbol).length : 0;
    const totalBanned = banned && !bannedError ? banned.length : 0;
    const totalSubgroups = subgroups && !subgroupsError ? subgroups.length : 0;
    const channels = subgroups && !subgroupsError ? subgroups.filter(s => s.chat_type === 'کانال').length : 0;
    const groups = subgroups && !subgroupsError ? subgroups.filter(s => s.chat_type === 'گروه').length : 0;

    let statusMessage = `🥷🏻 وضعیت ربات اکلیس\n\n`;
    statusMessage += `🔹 کل اعضای تایید شده: ${totalMembers}\n`;
    statusMessage += `🔹 اعضای وفادار: ${loyalMembers}\n`;
    statusMessage += `🔹 اعضای مشکوک: ${suspiciousMembers}\n`;
    statusMessage += `🔹 کاربران بن شده: ${totalBanned}\n`;
    statusMessage += `🔹 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده ✅' : 'تنظیم نشده ❌'}\n`;
    statusMessage += `🔹 زیرمجموعه‌های فعال: ${totalSubgroups}\n`;
    statusMessage += `🔹 کانال‌ها: ${channels}\n`;
    statusMessage += `🔹 گروه‌ها: ${groups}\n`;
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

// ==================[ مدیریت رویدادهای چت ]==================
// وقتی ربات به گروه یا کانال اضافه می‌شود
bot.on('chat_member', async (ctx) => {
  try {
    const chatMember = ctx.chatMember;
    const chatId = chatMember.chat.id.toString();
    const botUserId = bot.botInfo.id;
    
    // اگر مربوط به ربات خودمان نیست، نادیده بگیر
    if (chatMember.new_chat_member.user.id !== botUserId) {
      return;
    }
    
    console.log(`🤖 ربات به چت اضافه شد: ${chatMember.chat.title} (${chatId})`);
    console.log(`📊 وضعیت جدید: ${chatMember.new_chat_member.status}`);
    
    // اگر ربات عضو یا ادمین شد
    if (chatMember.new_chat_member.status === 'administrator' || chatMember.new_chat_member.status === 'member' || chatMember.new_chat_member.status === 'creator') {
      const chatInfo = await ctx.telegram.getChat(chatId);
      const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
      const chatTitle = chatInfo.title || 'بدون عنوان';
      
      console.log(`✅ ربات به ${chatType} "${chatTitle}" اضافه شد`);
      
      // اضافه کردن به دیتابیس
      await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
      
      // اطلاع به مالک
      if (OWNER_ID) {
        await ctx.telegram.sendMessage(OWNER_ID, 
          `✅ ربات به ${chatType} اضافه شد:\n\n` +
          `📝 نام: ${chatTitle}\n` +
          `🆔: ${chatId}\n` +
          `👥 نوع: ${chatType}\n` +
          `🔄 به طور خودکار به زیرمجموعه اضافه شد`
        );
      }
    }
    
  } catch (error) {
    console.log('❌ خطا در مدیریت اضافه شدن ربات به چت:', error.message);
  }
});

// ==================[ Callback Query برای دکمه‌ها ]==================
bot.action('kill_suspicious', async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      return ctx.answerCbQuery('فقط آکی میتونه از این دکمه استفاده کنه');
    }
    
    await ctx.answerCbQuery('در حال بن کردن کاربران مشکوک...');
    
    const suspiciousUsers = await getSuspiciousUsers();
    let totalBanned = 0;
    let totalFailed = 0;
    
    if (suspiciousUsers.length === 0) {
      return ctx.editMessageText('✅ هیچ کاربر مشکوکی برای بن کردن وجود ندارد.');
    }
    
    const processingMsg = await ctx.editMessageText(`🔫 در حال بن کردن ${suspiciousUsers.length} کاربر مشکوک...`);
    
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
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('fa-IR', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
    
    await ctx.editMessageText(
      `✅ عملیات بن کردن کامل شد\n\n` +
      `🔫 کاربران بن شده: ${totalBanned}\n` +
      `❌ خطاها: ${totalFailed}\n` +
      `🕒 زمان: ${timeString}`
    );
    
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربران مشکوک:', error.message);
    await ctx.editMessageText('❌ خطا در بن کردن کاربران مشکوک.');
  }
});

bot.action('dont_kill', async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      return ctx.answerCbQuery('فقط آکی میتونه از این دکمه استفاده کنه');
    }
    
    await ctx.answerCbQuery('کاربران مشکوک باقی ماندند');
    await ctx.editMessageText('✅ کاربران مشکوک بن نشدند و همچنان در سیستم باقی ماندند.');
    
  } catch (error) {
    console.log('❌ خطا در مدیریت دکمه عدم بن:', error.message);
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
