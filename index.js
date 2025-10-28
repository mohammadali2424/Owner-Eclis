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

// ==================[ کشف چت‌های جدید با منطق کاملاً جدید ]==================
const discoverAdminChats = async (ctx) => {
  try {
    console.log('🔄 شروع کشف چت‌های ادمین...');
    
    const discoveredChats = [];
    let newChatsAdded = 0;
    
    // روش 1: بررسی چت‌های شناخته شده فعلی
    const currentChats = await getActiveSubgroups();
    const knownChatIds = currentChats.map(chat => chat.chat_id);
    
    // اضافه کردن گروه اصلی اگر وجود دارد
    if (MAIN_GROUP_ID && !knownChatIds.includes(MAIN_GROUP_ID)) {
      knownChatIds.push(MAIN_GROUP_ID);
    }
    
    console.log(`📊 چت‌های شناخته شده: ${knownChatIds.length}`);
    
    // بررسی وضعیت ادمین در چت‌های شناخته شده
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
    
    // روش 2: استفاده از getUpdates برای کشف چت‌های جدید
    try {
      console.log('🔍 بررسی آپدیت‌های اخیر برای کشف چت‌های جدید...');
      
      // دریافت آخرین آپدیت‌ها
      const updates = await ctx.telegram.getUpdates({
        offset: -50, // آخرین 50 آپدیت
        limit: 50,
        timeout: 1
      });
      
      const processedChats = new Set();
      
      for (const update of updates) {
        try {
          // بررسی my_chat_member (وقتی وضعیت ربات در چتی تغییر می‌کند)
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
                    
                    // اضافه کردن به دیتابیس
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
          
          // بررسی regular messages
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
    
    // اگر ربات ادمین شده یا عضو شده
    if (chatMember.status === 'administrator' || chatMember.status === 'member') {
      try {
        const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
          const chatType = chat.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chat.title || 'بدون عنوان';
          
          const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
          
          if (added) {
            console.log(`✅ چت جدید خودکار اضافه شد: ${chatTitle} (${chatType})`);
            
            // اطلاع به مالک
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

// ==================[ دستور اصلی: بروزرسانی وضعیت چت‌ها ]==================
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

// ==================[ دستور اضافه کردن دستی چت ]==================
bot.command('add_chat', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const args = ctx.message.text.split(' ');
    if (args.length >= 2) {
      const chatId = args[1];
      
      try {
        const chatInfo = await ctx.telegram.getChat(chatId);
        const chatMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
        
        if (chatMember.status === 'administrator' || chatMember.status === 'creator') {
          const chatType = chatInfo.type === 'channel' ? 'کانال' : 'گروه';
          const chatTitle = chatInfo.title || 'بدون عنوان';
          
          const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
          
          if (added) {
            await ctx.reply(`✅ ${chatType} "${chatTitle}" با موفقیت اضافه شد`, {
              reply_to_message_id: ctx.message.message_id
            });
          } else {
            await ctx.reply('❌ خطا در ذخیره چت', {
              reply_to_message_id: ctx.message.message_id
            });
          }
        } else {
          await ctx.reply('❌ ربات در این چت ادمین نیست', {
            reply_to_message_id: ctx.message.message_id
          });
        }
      } catch (error) {
        await ctx.reply(`❌ خطا: ${error.message}`, {
          reply_to_message_id: ctx.message.message_id
        });
      }
      return;
    }

    const helpText = `💡 برای افزودن دستی چت:\n\n` +
      `/add_chat <chat_id>\n\n` +
      `📝 برای دریافت chat_id از @userinfobot استفاده کنید`;

    await ctx.reply(helpText, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.log('❌ خطا در افزودن چت:', error.message);
    await ctx.reply('❌ خطا در افزودن چت', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ بقیه توابع (اسکن اعضا، بن کردن و...) ]==================
const scanAllSubgroupsMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن اعضای چت‌ها...');
    
    const subgroups = await getActiveSubgroups();
    let totalMembersScanned = 0;
    
    for (const subgroup of subgroups) {
      try {
        let members = [];
        
        if (subgroup.chat_type === 'کانال') {
          const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
          members = admins.map(admin => admin.user).filter(user => !user.is_bot);
        } else {
          const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
          members = admins.map(admin => admin.user).filter(user => !user.is_bot);
        }
        
        for (const member of members) {
          const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);
          
          await supabase
            .from('eclis_members')
            .upsert({
              user_id: member.id,
              username: member.username || '',
              first_name: member.first_name || 'ناشناس',
              verified_by: OWNER_ID,
              verified_at: new Date().toISOString(),
              has_symbol: hasSymbol
            }, { onConflict: 'user_id' });

          totalMembersScanned++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.log(`❌ خطا در اسکن ${subgroup.chat_type}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ اسکن اعضا کامل شد: ${totalMembersScanned} عضو اسکن شد`);
    return { success: true, scanned: totalMembersScanned };
    
  } catch (error) {
    console.log('❌ خطا در اسکن اعضا:', error.message);
    return { success: false, scanned: 0 };
  }
};

// [بقیه توابع مانند banUserFromEcosystem, banUserFromEcosystemByUsername و... مانند قبل]

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
/checkmembers - بررسی اعضای وفادار
/groups - لیست گروه‌ها
/status - وضعیت ربات

💡 نکات:
- ربات به صورت خودکار چت‌های جدید را تشخیص می‌دهد
- از /update_chats برای اسکن دستی استفاده کنید`;

  ctx.reply(helpText, {
    reply_to_message_id: ctx.message.message_id
  });
});

// [بقیه دستورات مانند groups, status, checkmembers و... مانند قبل]

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

// [بقیه کدهای سرور و سلامت مانند قبل]

app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  startBot();
});
