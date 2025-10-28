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

const removeApprovedUser = async (userId) => {
  try {
    console.log(`🗑️ حذف کاربر از لیست تایید شده: ${userId}`);
    
    const { error } = await supabase
      .from('eclis_approved_users')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) {
      console.log('❌ خطا در حذف کاربر تایید شده:', error);
      return false;
    }
    
    console.log(`✅ کاربر از لیست تایید شده حذف شد`);
    return true;
  } catch (error) {
    console.log('❌ خطا در حذف کاربر تایید شده:', error.message);
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
    console.log('❌ خطا در کشف چت‌ها:', error.message);
    return { success: false, total: 0, newAdded: 0, discoveredChats: [] };
  }
};

// ==================[ هندلر برای وقتی که ربات به چتی اضافه می‌شود ]==================
bot.on('my_chat_member', async (ctx) => {
  try {
    console.log('🔄 رویداد my_chat_member دریافت شد');
    
    const chatMember = ctx.myChatMember.new_chat_member;
    const chat = ctx.myChatMember.chat;
    const chatId = chat.id.toString();
    
    console.log(`🤖 وضعیت ربات در چت ${chat.title}: ${chatMember.status}`);
    
    if (chatMember.status === 'administrator' || chatMember.status === 'member') {
      try {
        const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
          const chatType = chat.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chat.title || 'بدون عنوان';
          
          const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
          
          if (added) {
            console.log(`✅ چت جدید خودکار اضافه شد: ${chatTitle} (${chatType})`);
            
            if (ctx.from && ctx.from.id === OWNER_ID) {
              await ctx.reply(`✅ چت جدید شناسایی و اضافه شد:\n${chatTitle} (${chatType})`);
            }
          }
        }
      } catch (error) {
        console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
      }
    }
    
  } catch (error) {
    console.log('❌ خطا در پردازش my_chat_member:', error.message);
  }
});

// ==================[ سیستم امنیتی ورود به اکلیس ]==================

// هندلر برای وقتی که کاربر جدید وارد گروه اصلی می‌شود
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    
    // فقط برای گروه اصلی
    if (chatId !== MAIN_GROUP_ID) {
      return;
    }

    console.log('👤 کاربر جدید وارد گروه اصلی شد');
    
    const newMembers = ctx.message.new_chat_members;
    
    for (const member of newMembers) {
      // اگر کاربر ربات باشد، نادیده بگیر
      if (member.is_bot) continue;
      
      const userId = member.id;
      const userName = member.first_name || 'ناشناس';
      const username = member.username ? `@${member.username}` : 'ندارد';
      
      console.log(`🔍 بررسی کاربر جدید: ${userName} (${userId})`);
      
      // ایجاد پیام زیبا برای مالک
      const message = `🎭 **درخواست ورود به اکلیس**\n\n` +
        `👤 **مسافر جدید:** ${userName}\n` +
        `🆔 **آی‌دی:** ${userId}\n` +
        `📱 **نام کاربری:** ${username}\n\n` +
        `🤔 **آیا این مسافر اجازه ورود به اکلیس را دارد؟**`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ آره، اجازه داره', `approve_user_${userId}`)],
        [Markup.button.callback('❌ نه، اجازه نداره', `reject_user_${userId}`)]
      ]);
      
      // ارسال پیام به مالک
      await ctx.telegram.sendMessage(
        OWNER_ID, 
        message, 
        {
          parse_mode: 'Markdown',
          ...keyboard
        }
      );
      
      // پیام موقت در گروه اصلی
      const tempMsg = await ctx.reply(
        `👋 سلام ${userName}! درخواست ورود شما به اکلیس ثبت شد. لطفاً منتظر تایید باشید...`,
        { reply_to_message_id: ctx.message.message_id }
      );
      
      // حذف پیام موقت بعد از 10 ثانیه
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(tempMsg.message_id);
        } catch (error) {
          console.log('⚠️ خطا در حذف پیام موقت');
        }
      }, 10000);
    }
    
  } catch (error) {
    console.log('❌ خطا در پردازش کاربر جدید:', error.message);
  }
});

// هندلر برای وقتی که کاربر وارد گروه‌های زیرمجموعه می‌شود
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    
    // اگر گروه اصلی بود، قبلاً پردازش شده
    if (chatId === MAIN_GROUP_ID) {
      return;
    }
    
    // بررسی اینکه آیا این چت یکی از زیرمجموعه‌هاست
    const subgroups = await getActiveSubgroups();
    const subgroupIds = subgroups.map(sub => sub.chat_id);
    
    if (!subgroupIds.includes(chatId)) {
      return;
    }
    
    console.log('🔍 بررسی کاربر جدید در زیرمجموعه');
    
    const newMembers = ctx.message.new_chat_members;
    const subgroup = subgroups.find(sub => sub.chat_id === chatId);
    const subgroupName = subgroup ? subgroup.chat_title : 'ناشناخته';
    
    for (const member of newMembers) {
      // اگر کاربر ربات باشد، نادیده بگیر
      if (member.is_bot) continue;
      
      const userId = member.id;
      const userName = member.first_name || 'ناشناس';
      const username = member.username ? `@${member.username}` : 'ندارد';
      
      // بررسی آیا کاربر تایید شده است
      const isApproved = await isUserApproved(userId);
      
      if (!isApproved) {
        console.log(`🚫 کاربر تایید نشده در زیرمجموعه: ${userName} (${userId})`);
        
        // بن کردن کاربر از گروه زیرمجموعه
        try {
          await ctx.telegram.banChatMember(chatId, userId);
          console.log(`✅ کاربر از ${subgroupName} بن شد`);
          
          // ایجاد گزارش برای مالک
          const now = new Date();
          const timeString = now.toLocaleTimeString('fa-IR', { 
            hour: '2-digit', 
            minute: '2-digit'
          });
          
          const reportMessage = `🔪 **ارباب من، شخصی قصد ورود به اکلیس را داشته، اما با موفقیت توسط خنجر های من تیکه تیکه شد**\n\n` +
            `🏴‍☠️ **هویت اون به شهر زیره:**\n` +
            `┌ 👤 **اسم:** ${userName}\n` +
            `├ 🆔 **آی‌دی عددی:** ${userId}\n` +
            `├ 📝 **آی‌دی کاربری:** ${username}\n` +
            `├ 🏠 **گروهی که جوین شده بود:** ${subgroupName}\n` +
            `└ 🕒 **ساعتی که وارد شده:** ${timeString}`;
          
          await ctx.telegram.sendMessage(
            OWNER_ID,
            reportMessage,
            { parse_mode: 'Markdown' }
          );
          
        } catch (banError) {
          console.log(`❌ خطا در بن کردن کاربر: ${banError.message}`);
        }
      } else {
        console.log(`✅ کاربر تایید شده وارد زیرمجموعه شد: ${userName}`);
      }
    }
    
  } catch (error) {
    console.log('❌ خطا در پردازش کاربر جدید در زیرمجموعه:', error.message);
  }
});

// ==================[ Callback Query برای تایید کاربران ]==================

// تایید کاربر توسط مالک
bot.action(/approve_user_(\d+)/, async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه');
      return;
    }

    const userId = parseInt(ctx.match[1]);
    
    // دریافت اطلاعات کاربر
    let userInfo;
    try {
      userInfo = await ctx.telegram.getChat(userId);
    } catch (error) {
      await ctx.answerCbQuery('خطا در دریافت اطلاعات کاربر');
      return;
    }
    
    const userName = userInfo.first_name || 'ناشناس';
    const username = userInfo.username ? `@${userInfo.username}` : 'ندارد';
    
    // افزودن کاربر به لیست تایید شده
    const added = await addApprovedUser(userId, userInfo.username, userInfo.first_name, OWNER_ID);
    
    if (added) {
      await ctx.answerCbQuery('کاربر تایید شد');
      
      // ویرایش پیام اصلی
      await ctx.editMessageText(
        `🎉 **مسافر ${userName} (${username}) به جهان اکلیس خوش آمدید**\n\n` +
        `✅ دسترسی به تمام قلمرو اکلیس برای این مسافر باز شد.`,
        { parse_mode: 'Markdown' }
      );
      
      // ارسال پیام خوشامد به گروه اصلی
      try {
        await ctx.telegram.sendMessage(
          MAIN_GROUP_ID,
          `🎉 **خوش آمدید!**\n\n` +
          `مسافر ${userName} به جهان اکلیس خوش آمدید! اکنون می‌توانید به تمام قلمرو اکلیس دسترسی داشته باشید.`,
          { parse_mode: 'Markdown' }
        );
      } catch (groupError) {
        console.log('⚠️ خطا در ارسال پیام خوشامد به گروه اصلی');
      }
      
    } else {
      await ctx.answerCbQuery('خطا در تایید کاربر');
    }
    
  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('خطا در تایید کاربر');
  }
});

// رد کاربر توسط مالک
bot.action(/reject_user_(\d+)/, async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه');
      return;
    }

    const userId = parseInt(ctx.match[1]);
    
    // دریافت اطلاعات کاربر
    let userInfo;
    try {
      userInfo = await ctx.telegram.getChat(userId);
    } catch (error) {
      await ctx.answerCbQuery('خطا در دریافت اطلاعات کاربر');
      return;
    }
    
    const userName = userInfo.first_name || 'ناشناس';
    const username = userInfo.username ? `@${userInfo.username}` : 'ندارد';
    
    // حذف کاربر از گروه اصلی
    try {
      await ctx.telegram.banChatMember(MAIN_GROUP_ID, userId);
      console.log(`✅ کاربر از گروه اصلی حذف شد: ${userName}`);
    } catch (banError) {
      console.log(`⚠️ خطا در حذف کاربر از گروه اصلی: ${banError.message}`);
    }
    
    await ctx.answerCbQuery('کاربر رد شد');
    
    // ویرایش پیام اصلی
    await ctx.editMessageText(
      `🚫 **این غریبه با موفقیت از گروه بیرون رانده شد**\n\n` +
      `کاربر ${userName} (${username}) اجازه ورود به اکلیس را ندارد.`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('خطا در رد کاربر');
  }
});

// ==================[ بقیه توابع (اسکن اعضا، بن کردن و...) ]==================

// [بقیه توابع مانند scanAllSubgroupsMembers, banUserFromEcosystem, etc.]
// این توابع از کد قبلی بدون تغییر باقی می‌مانند

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
          try {
            const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
            members = admins.map(admin => admin.user).filter(user => !user.is_bot);
            console.log(`👥 تعداد مدیران کانال: ${members.length}`);
          } catch (error) {
            console.log(`❌ خطا در دریافت مدیران کانال:`, error.message);
          }
        } else {
          try {
            const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
            members = admins.map(admin => admin.user).filter(user => !user.is_bot);
            console.log(`👥 تعداد مدیران گروه: ${members.length}`);
          } catch (error) {
            console.log(`❌ خطا در دریافت مدیران گروه:`, error.message);
          }
        }
        
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
    
    const { data: members, error } = await supabase
      .from('eclis_members')
      .select('user_id, username, first_name, has_symbol, verified_at');

    if (error) {
      console.log('❌ خطا در دریافت اعضا:', error);
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        console.log('⚠️ خطا در حذف پیام موقت:', e.message);
      }
      return ctx.reply('❌ خطا در دریافت اطلاعات اعضا از دیتابیس.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    console.log(`📊 تعداد کل اعضا از دیتابیس: ${members?.length || 0}`);
    
    const loyalUsers = members?.filter(m => m.has_symbol) || [];
    const suspiciousUsers = members?.filter(m => !m.has_symbol) || [];

    console.log(`📊 وفادار: ${loyalUsers.length}, مشکوک: ${suspiciousUsers.length}`);

    let message = `🏰 بررسی وفاداری اعضای اکلیس\n\n`;
    message += `✅ اعضای وفادار: ${loyalUsers.length} نفر\n`;
    message += `⚠️ اعضای مشکوک: ${suspiciousUsers.length} نفر\n\n`;

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
      message += `🎉 همه اعضا وفادار هستند! هیچ اقدام لازم نیست.`;
      
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
/ban @username - بن کردن کاربر
/checkmembers - بررسی وفاداری اعضا
/groups - لیست گروه‌ها
/status - وضعیت ربات

💡 همچنین می‌توانید بنویسید:
"بررسی وفاداری" - برای بررسی اعضای وفادار

🎯 سیستم امنیتی:
• کاربران باید ابتدا از گروه اصلی تایید شوند
• دسترسی خودکار به تمام زیرمجموعه‌ها پس از تایید
• حذف خودکار کاربران تایید نشده از زیرمجموعه‌ها`;

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

// [بقیه دستورات مانند update_chats, add_chat, ban, groups, status و... مانند قبل]

// ==================[ Callback Query برای کشتن کاربران مشکوک ]==================

bot.action('kill_suspicious', async (ctx) => {
  try {
    if (!checkOwnerAccessCallback(ctx)) {
      await ctx.answerCbQuery('فقط آکی می‌تونه این کار رو بکنه');
      return;
    }

    await ctx.answerCbQuery('در حال بن کردن کاربران مشکوک...');
    
    const { data: suspiciousUsers, error } = await supabase
      .from('eclis_members')
      .select('user_id, username, first_name')
      .eq('has_symbol', false);

    if (error) {
      console.log('❌ خطا در دریافت کاربران مشکوک:', error);
      await ctx.answerCbQuery('خطا در دریافت کاربران مشکوک');
      return;
    }

    let totalBanned = 0;
    let totalFailed = 0;

    for (const user of suspiciousUsers) {
      try {
        // بن کردن از گروه اصلی
        if (MAIN_GROUP_ID) {
          await bot.telegram.banChatMember(MAIN_GROUP_ID, user.user_id);
        }
        
        // بن کردن از زیرمجموعه‌ها
        const subgroups = await getActiveSubgroups();
        for (const subgroup of subgroups) {
          try {
            await bot.telegram.banChatMember(subgroup.chat_id, user.user_id);
          } catch (error) {
            console.log(`❌ خطا در بن کردن از ${subgroup.chat_title}:`, error.message);
          }
        }
        
        totalBanned++;
      } catch (error) {
        totalFailed++;
        console.log(`❌ خطا در بن کردن کاربر ${user.user_id}:`, error.message);
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
  startBot();
});
