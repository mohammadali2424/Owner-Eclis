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
    
    // بررسی اینکه آیا چت قبلاً وجود دارد
    const { data: existingChat, error: checkError } = await supabase
      .from('aklis_subgroups')
      .select('chat_id')
      .eq('chat_id', chatId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.log('❌ خطا در بررسی چت موجود:', checkError);
    }

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

// ==================[ اسکن و اضافه کردن تمام چت‌هایی که ربات ادمین است - COMPLETELY REWRITTEN ]==================
const scanAndAddAllAdminChats = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن تمام چت‌هایی که ربات ادمین است...');
    
    let newChatsAdded = 0;
    let totalChatsChecked = 0;
    
    // اینجا باید تمام چت‌هایی که ربات عضو است را بررسی کنیم
    // اما تلگرام API مستقیمی برای این کار ندارد
    // بنابراین از روش جایگزین استفاده می‌کنیم
    
    try {
      // ابتدا چت‌های موجود در دیتابیس را بررسی می‌کنیم
      const existingSubgroups = await getActiveSubgroups();
      
      // بررسی وضعیت هر چت موجود
      for (const chat of existingSubgroups) {
        try {
          const chatMember = await ctx.telegram.getChatMember(chat.chat_id, bot.botInfo.id);
          if (chatMember.status === 'left' || chatMember.status === 'kicked') {
            console.log(`❌ ربات از ${chat.chat_type} "${chat.chat_title}" اخراج شده`);
            await removeChatFromSubgroups(chat.chat_id);
          } else {
            console.log(`✅ ربات در ${chat.chat_type} "${chat.chat_title}" فعال است`);
          }
          totalChatsChecked++;
          
          // تاخیر برای جلوگیری از محدودیت
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.log(`❌ خطا در بررسی ${chat.chat_type} "${chat.chat_title}":`, error.message);
          await removeChatFromSubgroups(chat.chat_id);
        }
      }
      
    } catch (error) {
      console.log('❌ خطا در اسکن چت‌ها:', error.message);
    }
    
    // اضافه کردن گروه اصلی اگر تنظیم شده باشد
    if (MAIN_GROUP_ID) {
      try {
        const chatMember = await ctx.telegram.getChatMember(MAIN_GROUP_ID, bot.botInfo.id);
        if (chatMember && (chatMember.status === 'administrator' || chatMember.status === 'member')) {
          const chat = await ctx.telegram.getChat(MAIN_GROUP_ID);
          const added = await addChatToSubgroups(MAIN_GROUP_ID, chat.title, 'گروه', OWNER_ID);
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
    console.log('❌ خطا در اسکن چت‌های ادمین:', error.message);
    return { success: false, totalChecked: 0, newAdded: 0 };
  }
};

// ==================[ اسکن اعضای تمام چت‌های زیرمجموعه - NEW ]==================
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
            console.log(`❌ خطا در دریافت مدیران کانال:`, error.message);
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
            .from('aklis_members')
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

// ==================[ بررسی وضعیت چت‌های زیرمجموعه - COMPLETELY REWRITTEN ]==================
const checkSubgroupsStatus = async (ctx) => {
  try {
    console.log('🔍 بررسی وضعیت چت‌های زیرمجموعه...');
    
    // ابتدا اسکن و اضافه کردن تمام چت‌های ادمین
    const scanResult = await scanAndAddAllAdminChats(ctx);
    
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

// دستور بررسی اعضای اکلیس - COMPLETELY REWRITTEN
bot.command('checkmembers', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی اعضا از:', ctx.from?.first_name);
    
    // بررسی اینکه دستور فقط در گروه اصلی اجرا شود
    const chatId = ctx.chat.id.toString();
    if (chatId !== MAIN_GROUP_ID) {
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

    const processingMsg = await ctx.reply('🔍 در حال اسکن و بررسی اعضای تمام گروه‌ها و کانال‌های اکلیس...', {
      reply_to_message_id: ctx.message.message_id
    });

    // اسکن تمام چت‌های زیرمجموعه و اعضای آنها
    await scanAllSubgroupsMembers(ctx);
    
    // سپس اطلاعات را از دیتابیس می‌خوانیم
    const { data: members, error } = await supabase
      .from('aklis_members')
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

// دستور بررسی وضعیت گروه‌ها - IMPROVED
bot.command('check', async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی وضعیت گروه‌ها از:', ctx.from?.first_name);
    
    // بررسی اینکه دستور فقط در گروه اصلی اجرا شود
    const chatId = ctx.chat.id.toString();
    if (chatId !== MAIN_GROUP_ID) {
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

    const { activeSubgroups, newGroups, removedGroups, totalChecked } = checkResult;
    
    let message = `🔄 بروزرسانی وضعیت گروه‌های زیرمجموعه\n\n`;
    
    if (removedGroups.length > 0) {
      message += `❌ ${removedGroups.length} گروه/کانال غیرفعال شدند:\n`;
      removedGroups.forEach((group, index) => {
        message += `${index + 1}. ${group.chat_title} (${group.chat_type})\n`;
      });
      message += `\n`;
    }
    
    if (newGroups > 0) {
      message += `✅ ${newGroups} گروه/کانال جدید شناسایی و اضافه شدند\n\n`;
    }
    
    if (newGroups === 0 && removedGroups.length === 0) {
      message += `✅ همه گروه‌ها و کانال‌ها در امان هستند!\n\n`;
    }
    
    // نمایش لیست گروه‌ها و کانال‌های فعال
    if (activeSubgroups.length > 0) {
      message += `📋 لیست گروه‌ها و کانال‌های فعال:\n`;
      activeSubgroups.forEach((subgroup, index) => {
        message += `${index + 1}. ${subgroup.chat_title} (${subgroup.chat_type})\n`;
      });
      message += `\n`;
    }
    
    message += `📊 آمار نهایی:\n`;
    message += `• گروه/کانال‌های فعال: ${activeSubgroups.length}\n`;
    message += `• گروه/کانال‌های جدید: ${newGroups}\n`;
    message += `• گروه/کانال‌های حذف شده: ${removedGroups.length}\n`;
    message += `• کل چت‌های بررسی شده: ${totalChecked}\n\n`;
    
    message += `🏠 گروه اصلی: ${MAIN_GROUP_ID ? 'متصل ✅' : 'تنظیم نشده ❌'}\n\n`;
    
    message += `🔄 ربات به طور خودکار گروه‌ها و کانال‌هایی که ادمین شده را به زیرمجموعه اضافه می‌کند`;

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

// ==================[ مدیریت اضافه شدن ربات به چت‌ها - IMPROVED ]==================
bot.on('message', async (ctx) => {
  try {
    // اگر ربات به گروه/کانال اضافه شده باشد
    if (ctx.message.new_chat_members) {
      console.log('👥 تشخیص اعضای جدید در چت:', ctx.chat.title);
      
      for (const member of ctx.message.new_chat_members) {
        console.log(`🔍 بررسی عضو: ${member.first_name} (${member.id}) - بات: ${member.is_bot}`);
        
        if (member.is_bot && member.username === SELF_BOT_ID) {
          const chatId = ctx.chat.id.toString();
          const chatTitle = ctx.chat.title || 'بدون عنوان';
          const chatType = ctx.chat.type === 'channel' ? 'کانال' : 'گروه';
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
            if (MAIN_GROUP_ID && chatId !== MAIN_GROUP_ID) {
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
                  parse_mode: 'Markdown',
                  reply_to_message_id: ctx.message.message_id
                }
              );
            }
          }
          return;
        }
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش پیام:', error.message);
  }
});

// ==================[ پردازش Callback ها - FIXED ]==================
bot.action('kill_suspicious', async (ctx) => {
  try {
    console.log('🔫 کلیک روی دکمه "آره" برای بن کردن کاربران مشکوک');
    
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
    console.log('❌ کلیک روی دکمه "نه" برای لغو بن کردن');
    
    // بررسی مالکیت
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه', { show_alert: true });
      return;
    }

    await ctx.editMessageText('فرصتی دوباره برای زندگی...\n\nکاربران مشکوک می‌تونن تا دفعه بعدی زنده بمونن!');
    console.log('❌ بن کردن اعضای مشکوک توسط مالک لغو شد');
    
  } catch (error) {
    console.log('❌ خطا در لغو:', error.message);
  }
});

// بقیه کدها بدون تغییر...

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
