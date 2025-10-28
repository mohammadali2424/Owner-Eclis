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

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ تنظیمات ضروری وجود ندارد');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ پیام‌های رندوم برای بن کردن ]==================
const BAN_MESSAGES = [
  "🔪 نام_کاربر با خنجرهای من تکه تکه شد!",
  "🚫 نام_کاربر از اکلیس بیرون انداخته شد!",
  "💀 نام_کاربر به دست نگهبانان اکلیس نابود شد!",
  "⚔️ نام_کاربر توسط شمشیرهای من از بین رفت!",
  "🔥 نام_کاربر در آتش اکلیس سوخت!",
  "🌪 نام_کاربر توسط طوفان اکلیس محو شد!",
  "❄️ نام_کاربر در یخ‌های اکلیس یخ زد!",
  "⚡ نام_کاربر با صاعقه‌های من نابود شد!",
  "🏹 نام_کاربر توسط تیرهای من از پای درآمد!",
  "🧨 نام_کاربر منفجر شد و از اکلیس محو شد!",
  "🌑 نام_کاربر در تاریکی اکلیس گم شد!",
  "☠️ نام_کاربر به دست سایه‌های اکلیس نابود شد!",
  "🗡 نام_کاربر توسط خنجرهای نامرئی من از بین رفت!",
  "🔱 نام_کاربر توسط نیزه‌های سه‌شاخه اکلیس نابود شد!",
  "🎯 نام_کاربر دقیقاً هدف قرار گرفت و حذف شد!",
  "💥 نام_کاربر منفجر شد و از اکلیس پاک شد!",
  "🪓 نام_کاربر توسط تبر اکلیس دو نیم شد!",
  "🗡️ نام_کاربر قربانی خنجرهای اکلیس شد!",
  "⚰️ نام_کاربر به گورستان اکلیس فرستاده شد!",
  "👻 نام_کاربر به روحی در اکلیس تبدیل شد!"
];

// تابع برای انتخاب رندوم پیام و جایگزینی نام کاربر
const getRandomBanMessage = (userName) => {
  const randomMessage = BAN_MESSAGES[Math.floor(Math.random() * BAN_MESSAGES.length)];
  return randomMessage.replace(/نام_کاربر/g, userName);
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
    console.log('❌ خطا در پردازش درخواست:', error);
    if (ctx.from && ctx.from.id === OWNER_ID) {
      await ctx.reply(`❌ خطا: ${error.message}`, {
        reply_to_message_id: ctx.message?.message_id
      });
    }
  }
});

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || userId !== OWNER_ID) {
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
  
  for (const symbol of symbols) {
    if (textStr.includes(symbol)) {
      return true;
    }
  }
  
  const symbolRegex = /[꩘𖢻ꑭ𖮌]/u;
  return symbolRegex.test(textStr);
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

// ==================[ مدیریت کاربران تایید شده ]==================
const addApprovedUser = async (userId, username, firstName, approvedBy) => {
  try {
    console.log(`✅ افزودن کاربر تایید شده: ${firstName} (${userId})`);
    
    const { error } = await supabase
      .from('eclis_approved_users')
      .upsert({
        user_id: userId,
        username: username || '',
        first_name: firstName || 'ناشناس',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        is_active: true
      }, { onConflict: 'user_id' });

    if (error) {
      console.log('❌ خطا در ذخیره کاربر تایید شده:', error);
      return false;
    }
    
    console.log(`✅ کاربر ${userId} به لیست تایید شده اضافه شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در افزودن کاربر تایید شده:', error.message);
    return false;
  }
};

const isUserApproved = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('eclis_approved_users')
      .select('user_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    return !error && data;
  } catch (error) {
    console.log('❌ خطا در بررسی تایید کاربر:', error.message);
    return false;
  }
};

// ==================[ کشف چت‌های جدید ]==================
const discoverAdminChats = async (ctx) => {
  try {
    console.log('🔄 شروع کشف چت‌های ادمین...');
    
    const discoveredChats = [];
    let newChatsAdded = 0;
    
    const currentChats = await getActiveSubgroups();
    const knownChatIds = currentChats.map(chat => chat.chat_id);
    
    if (MAIN_GROUP_ID && !knownChatIds.includes(MAIN_GROUP_ID)) {
      knownChatIds.push(MAIN_GROUP_ID);
    }
    
    console.log(`📊 چت‌های شناخته شده: ${knownChatIds.length}`);
    
    for (const chatId of knownChatIds) {
      try {
        const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
          const chatInfo = await ctx.telegram.getChat(chatId);
          const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chatInfo.title || 'بدون عنوان';
          
          discoveredChats.push({
            chat_id: chatId,
            chat_title: chatTitle,
            chat_type: chatType,
            status: chatMember.status
          });
          
          console.log(`✅ ربات در ${chatType} "${chatTitle}" ادمین است`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
      }
    }
    
    try {
      console.log('🔍 بررسی آپدیت‌های اخیر برای کشف چت‌های جدید...');
      
      const updates = await ctx.telegram.getUpdates({
        offset: -50,
        limit: 50,
        timeout: 1
      });
      
      const processedChats = new Set();
      
      for (const update of updates) {
        try {
          if (update.my_chat_member) {
            const chatId = update.my_chat_member.chat.id.toString();
            
            if (!processedChats.has(chatId) && !knownChatIds.includes(chatId)) {
              processedChats.add(chatId);
              
              const chatMember = update.my_chat_member.new_chat_member;
              if (chatMember.status === 'administrator' || chatMember.status === 'member') {
                try {
                  const chatInfo = await ctx.telegram.getChat(chatId);
                  const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
                  
                  if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
                    const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
                    const chatTitle = chatInfo.title || 'بدون عنوان';
                    
                    const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
                    if (added) {
                      discoveredChats.push({
                        chat_id: chatId,
                        chat_title: chatTitle,
                        chat_type: chatType,
                        status: currentMember.status,
                        is_new: true
                      });
                      newChatsAdded++;
                      console.log(`🎯 چت جدید کشف شد: ${chatTitle} (${chatType})`);
                    }
                  }
                } catch (error) {
                  console.log(`❌ خطا در بررسی چت جدید ${chatId}:`, error.message);
                }
              }
            }
          }
          
          if (update.message && update.message.chat) {
            const chatId = update.message.chat.id.toString();
            
            if (!processedChats.has(chatId) && !knownChatIds.includes(chatId)) {
              processedChats.add(chatId);
              
              try {
                const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
                
                if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
                  const chatInfo = update.message.chat;
                  const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
                  const chatTitle = chatInfo.title || 'بدون عنوان';
                  
                  const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
                  if (added) {
                    discoveredChats.push({
                      chat_id: chatId,
                      chat_title: chatTitle,
                      chat_type: chatType,
                      status: chatMember.status,
                      is_new: true
                    });
                    newChatsAdded++;
                    console.log(`🎯 چت جدید از پیام کشف شد: ${chatTitle} (${chatType})`);
                  }
                }
              } catch (error) {
                // احتمالاً ربات در چت نیست
              }
            }
          }
          
        } catch (error) {
          console.log('❌ خطا در پردازش آپدیت:', error.message);
        }
      }
    } catch (error) {
      console.log('❌ خطا در دریافت آپدیت‌ها:', error.message);
    }
    
    console.log(`✅ کشف چت‌ها کامل شد: ${discoveredChats.length} چت, ${newChatsAdded} چت جدید`);
    
    return { 
      success: true, 
      total: discoveredChats.length,
      newAdded: newChatsAdded,
      discoveredChats: discoveredChats
    };
    
  } catch (error) {
    console.log('❌ خطا در کشف چت‌ه��:', error.message);
    return { success: false, total: 0, newAdded: 0, discoveredChats: [] };
  }
};

// ==================[ دستور update_chats ]==================
bot.command('update_chats', async (ctx) => {
  try {
    console.log('🔄 درخواست بروزرسانی وضعیت چت‌ها');
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const tempMessage = await ctx.reply('🔄 در حال کشف و بروزرسانی تمام چت‌ها...', {
      reply_to_message_id: ctx.message.message_id
    });
    
    const discoveryResult = await discoverAdminChats(ctx);
    
    if (!discoveryResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}
      return ctx.reply('❌ خطا در بروزرسانی چت‌ها.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { total, newAdded, discoveredChats } = discoveryResult;
    
    let message = `🔄 بروزرسانی وضعیت چت‌ها\n\n`;
    message += `✅ عملیات موفق!\n\n`;
    message += `📊 نتایج:\n`;
    message += `• کل چت‌های فعال: ${total}\n`;
    message += `• چت‌های جدید: ${newAdded}\n\n`;
    
    if (discoveredChats.length > 0) {
      message += `🏘️ چت‌های فعال:\n`;
      discoveredChats.forEach((chat, index) => {
        const statusIcon = chat.status === 'creator' ? '👑' : '⚡';
        const newIcon = chat.is_new ? ' 🆕' : '';
        message += `${index + 1}. ${chat.chat_title} (${chat.chat_type}) ${statusIcon}${newIcon}\n`;
      });
    } else {
      message += `📭 هیچ چت فعالی پیدا نشد\n`;
    }

    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {}
    
    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.log('❌ خطا در بروزرسانی چت‌ها:', error.message);
    await ctx.reply('❌ خطا در بروزرسانی چت‌ها.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

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
    
    // حذف کاربر از لیست تایید شده
    const { error: deleteApprovedError } = await supabase
      .from('eclis_approved_users')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (deleteApprovedError) {
      console.log('❌ خطا در حذف کاربر از لیست تایید شده:', deleteApprovedError);
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
    return { 
      success: true, 
      banned: totalBanned, 
      failed: totalFailed,
      userName: firstName || username || 'ناشناس'
    };
    
  } catch (error) {
    console.log('❌ خطا در بن کردن کاربر از اکوسیستم:', error.message);
    return { success: false, banned: 0, failed: 0, userName: '' };
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
      return { 
        success: false, 
        banned: 0, 
        failed: 0, 
        message: 'کاربر در دیتابیس پیدا نشد',
        userName: ''
      };
    }

    console.log(`✅ کاربر پیدا شد: ${user.first_name} (${user.user_id})`);
    
    // سپس کاربر را بن کن
    return await banUserFromEcosystem(user.user_id, user.username, user.first_name);
  } catch (error) {
    console.log('❌ خطا در بن کردن با نام کاربری:', error.message);
    return { success: false, banned: 0, failed: 0, message: error.message, userName: '' };
  }
};

// ==================[ اسکن اعضای تمام چت‌های زیرمجموعه - بدون مدیران ]==================
const scanAllSubgroupsMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن اعضای تمام چت‌های زیرمجموعه...');
    
    const subgroups = await getActiveSubgroups();
    let totalMembersScanned = 0;
    let totalMembersSaved = 0;
    
    for (const subgroup of subgroups) {
      try {
        console.log(`🔍 اسکن ${subgroup.chat_type}: ${subgroup.chat_title}`);
        
        let allMembers = [];
        let admins = [];
        
        // دریافت مدیران
        try {
          admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
          console.log(`👑 تعداد مدیران ${subgroup.chat_type}: ${admins.length}`);
        } catch (error) {
          console.log(`❌ خطا در دریافت مدیران ${subgroup.chat_type}:`, error.message);
        }
        
        // برای گروه‌ها، اعضای عادی را هم بررسی می‌کنیم
        if (subgroup.chat_type === 'گروه') {
          try {
            // این فقط یک نمونه است - در عمل ممکن است نیاز به روش دیگری باشد
            // چون Telegram API راه مستقیمی برای دریافت تمام اعضای گروه ندارد
            console.log(`📊 گروه: فقط مدیران بررسی می‌شوند`);
          } catch (error) {
            console.log(`❌ خطا در دریافت اعضای گروه:`, error.message);
          }
        }
        
        // فقط مدیران را برای بررسی وفاداری در نظر بگیر
        const membersToCheck = admins.map(admin => admin.user).filter(user => !user.is_bot);
        
        console.log(`👥 تعداد کاربران برای بررسی وفاداری: ${membersToCheck.length}`);
        
        for (const member of membersToCheck) {
          const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);
          
          const { error } = await supabase
            .from('eclis_members')
            .upsert({
              user_id: member.id,
              username: member.username || '',
              first_name: member.first_name || 'ناشناس',
              verified_by: OWNER_ID,
              verified_at: new Date().toISOString(),
              has_symbol: hasSymbol,
              is_admin: true // علامت گذاری به عنوان مدیر
            }, { onConflict: 'user_id' });

          if (!error) {
            totalMembersSaved++;
          }
          
          totalMembersScanned++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.log(`❌ خطا در اسکن ${subgroup.chat_type}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ اسکن اعضا کامل شد: ${totalMembersScanned} عضو اسکن شد, ${totalMembersSaved} عضو ذخیره/آپدیت شد`);
    return { success: true, scanned: totalMembersScanned, saved: totalMembersSaved };
    
  } catch (error) {
    console.log('❌ خطا در اسکن اعضای زیرمجموعه‌ها:', error.message);
    return { success: false, scanned: 0, saved: 0 };
  }
};

// ==================[ دریافت کاربران مشکوک (بدون مدیران) ]==================
const getSuspiciousUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('eclis_members')
      .select('user_id, username, first_name, has_symbol, is_admin')
      .eq('has_symbol', false)
      .eq('is_admin', false); // فقط کاربران عادی، نه مدیران

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

// ==================[ تابع بررسی وفاداری ]==================
const checkLoyaltyMembers = async (ctx) => {
  try {
    console.log('🔍 درخواست بررسی وفاداری اعضا');
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const processingMsg = await ctx.reply('🔍 در حال اسکن و بررسی وفاداری اعضای تمام گروه‌ها و کانال‌های اکلیس...', {
      reply_to_message_id: ctx.message?.message_id
    });

    await discoverAdminChats(ctx);
    await scanAllSubgroupsMembers(ctx);
    
    const suspiciousUsers = await getSuspiciousUsers();

    console.log(`📊 کاربران مشکوک (بدون مدیران): ${suspiciousUsers.length}`);

    let message = `🏰 بررسی وفاداری اعضای اکلیس\n\n`;
    message += `⚠️ اعضای مشکوک (بدون مدیران): ${suspiciousUsers.length} نفر\n\n`;

    if (suspiciousUsers.length > 0) {
      message += `آیا ${suspiciousUsers.length} عضو مشکوک توی کل اکوسیستم اکلیس رو بکشم ؟`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ آره، همه رو بکش', 'kill_suspicious')],
        [Markup.button.callback('❌ نه، بذار زنده باشن', 'dont_kill')]
      ]);

      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      
      await ctx.reply(message, {
        ...keyboard,
        reply_to_message_id: ctx.message?.message_id
      });
    } else {
      message += `🎉 هیچ عضو مشکوکی پیدا نشد! همه مدیران یا وفادار هستند.`;
      
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      
      await ctx.reply(message, {
        reply_to_message_id: ctx.message?.message_id
      });
    }

  } catch (error) {
    console.log('❌ خطا در بررسی وفاداری:', error.message);
    await ctx.reply('❌ خطا در بررسی وفاداری اعضا.', {
      reply_to_message_id: ctx.message?.message_id
    });
  }
};

// ==================[ دستور بن با کلمه "بن" ]==================
bot.hears(/^بن @(\w+)$/, async (ctx) => {
  try {
    console.log('⚠️ درخواست بن با کلمه "بن"');
    
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const targetUsername = ctx.match[1];
    console.log(`🎯 بن کاربر: @${targetUsername}`);

    const processingMsg = await ctx.reply(`🔫 در حال بن کردن @${targetUsername} از کل اکوسیستم...`, {
      reply_to_message_id: ctx.message.message_id
    });

    const result = await banUserFromEcosystemByUsername(targetUsername);
    
    if (result.success && result.banned > 0) {
      // انتخاب پیام رندوم
      const banMessage = getRandomBanMessage(result.userName);
      
      const resultMessage = `🗡️ ${banMessage}\n\n` +
        `📋 از ${result.banned} گروه/کانال بن شد\n` +
        `⏰ ${new Date().toLocaleTimeString('fa-IR')}`;

      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      
      await ctx.reply(resultMessage, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      
      await ctx.reply(`❌ خطا در بن کردن کاربر @${targetUsername}\n\n${result.message || 'کاربر ممکن است در دیتابیس وجود نداشته باشد.'}`, {
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.log('❌ خطا در اجرای دستور بن:', error.message);
    await ctx.reply('❌ خطا در اجرای دستور بن', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ دستورات اصلی ]==================

bot.start((ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  return ctx.reply('🥷🏻 ربات مدیریت اکلیس فعال است\n\nاز /help برای راهنما استفاده کنید', {
    reply_to_message_id: ctx.message.message_id
  });
});

bot.command('help', (ctx) => {
  const access = checkOwnerAccess(ctx);
  if (!access.hasAccess) {
    return ctx.reply(access.message, {
      reply_to_message_id: ctx.message.message_id
    });
  }
  
  const helpText = `🥷🏻 راهنمای ربات مدیریت اکلیس

📋 دستورات:
/update_chats - کشف و بروزرسانی چت‌ها
/add_chat - افزودن دستی چت
بن @username - بن کردن کاربر
/checkmembers - بررسی وفاداری اعضا
/groups - لیست گروه‌ها
/status - وضعیت ربات

💡 همچنین می‌توانید بنویسید:
"بررسی وفاداری" - برای بررسی اعضای وفادار

🎯 سیستم امنیتی:
• کاربران باید ابتدا از گروه اصلی تایید شوند
• مدیران در لیست مشکوک‌ها قرار نمی‌گیرند
• پیام‌های رندوم برای بن کردن`;

  ctx.reply(helpText, {
    reply_to_message_id: ctx.message.message_id
  });
});

bot.hears('بررسی وفاداری', async (ctx) => {
  await checkLoyaltyMembers(ctx);
});

bot.command('checkmembers', async (ctx) => {
  await checkLoyaltyMembers(ctx);
});

// ==================[ Callback Query برای کشتن کاربران مشکوک ]==================

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
        
        // ارسال پیام رندوم برای هر کاربر بن شده
        const banMessage = getRandomBanMessage(user.first_name || user.username || 'ناشناس');
        await ctx.reply(banMessage);
        
      } else {
        totalFailed++;
      }
      
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

// ==================[ بقیه دستورات (groups, status, add_chat) بدون تغییر ]==================
// [این دستورات از کد قبلی بدون تغییر باقی می‌مانند]

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
      message += `💡 از دستور /add_chat برای افزودن چت‌ها استفاده کنید`;
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
      .select('user_id, has_symbol, is_admin');

    const { data: banned, error: bannedError } = await supabase
      .from('eclis_banned')
      .select('user_id');

    const { data: subgroups, error: subgroupsError } = await supabase
      .from('eclis_subgroups')
      .select('chat_id')
      .eq('is_active', true);

    const { data: approvedUsers, error: approvedError } = await supabase
      .from('eclis_approved_users')
      .select('user_id')
      .eq('is_active', true);

    const totalMembers = members && !membersError ? members.length : 0;
    const adminMembers = members && !membersError ? members.filter(m => m.is_admin).length : 0;
    const loyalMembers = members && !membersError ? members.filter(m => m.has_symbol).length : 0;
    const suspiciousMembers = members && !membersError ? members.filter(m => !m.has_symbol && !m.is_admin).length : 0;
    const totalBanned = banned && !bannedError ? banned.length : 0;
    const totalSubgroups = subgroups && !subgroupsError ? subgroups.length : 0;
    const totalApproved = approvedUsers && !approvedError ? approvedUsers.length : 0;

    let statusMessage = `🥷🏻 وضعیت ربات اکلیس\n\n`;
    statusMessage += `🔹 کل اعضای تایید شده: ${totalMembers}\n`;
    statusMessage += `🔹 مدیران: ${adminMembers}\n`;
    statusMessage += `🔹 اعضای وفادار: ${loyalMembers}\n`;
    statusMessage += `🔹 اعضای مشکوک: ${suspiciousMembers}\n`;
    statusMessage += `🔹 کاربران بن شده: ${totalBanned}\n`;
    statusMessage += `🔹 کاربران تایید شده: ${totalApproved}\n`;
    statusMessage += `🔹 گروه اصلی: ${MAIN_GROUP_ID ? 'تنظیم شده ✅' : 'تنظیم نشده ❌'}\n`;
    statusMessage += `🔹 زیرمجموعه‌های فعال: ${totalSubgroups}\n`;
    statusMessage += `🔹 وضعیت دیتابیس: ${membersError ? 'قطع ❌' : 'متصل ✅'}\n`;
    statusMessage += `🔹 وضعیت ربات: فعال ✅\n\n`;

    console.log(`📊 آمار: ${totalMembers} عضو, ${adminMembers} مدیر, ${loyalMembers} وفادار, ${suspiciousMembers} مشکوک, ${totalBanned} بن شده, ${totalSubgroups} زیرمجموعه`);
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

// ==================[ راه‌اندازی ]==================
const startBot = async () => {
  try {
    console.log('🤖 راه‌اندازی ربات...');
    
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'callback_query', 'my_chat_member'],
      polling: {
        timeout: 30,
        limit: 100,
        allowedUpdates: ['message', 'chat_member', 'callback_query', 'my_chat_member']
      }
    });
    
    console.log('✅ ربات فعال شد');
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    process.exit(1);
  }
};

// ==================[ سرور و سلامت ]==================
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
          <strong>ربات فعال است - سیستم امنیتی اکلیس فعال</strong>
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

app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  console.log(`🔐 سیستم امنیتی اکلیس فعال شد`);
  console.log(`🎯 پیام‌های رندوم بن: ${BAN_MESSAGES.length} پیام`);
  startBot();
});
