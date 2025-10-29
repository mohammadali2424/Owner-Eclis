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
const OWNER_ID = parseInt(process.env.OWNER_ID) || 0;
const MAIN_GROUP_ID = process.env.MAIN_GROUP_ID || '';
const RENDER_URL = process.env.RENDER_URL || ''; // آدرس دپلوی رندر

console.log('🔧 شروع راه‌اندازی ربات مدیریت Eclis...');
console.log('📋 بررسی تنظیمات محیطی...');

// بررسی وجود متغیرهای محیطی ضروری
if (!BOT_TOKEN) {
  console.log('❌ BOT_TOKEN وجود ندارد');
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.log('❌ SUPABASE_URL وجود ندارد');
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.log('❌ SUPABASE_KEY وجود ندارد');
  process.exit(1);
}
if (!MAIN_GROUP_ID) {
  console.log('❌ MAIN_GROUP_ID وجود ندارد');
  process.exit(1);
}

console.log('✅ تمام تنظیمات بررسی شد');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// ==================[ سیستم پینگ خودکار ]==================
const startPingService = () => {
  if (RENDER_URL) {
    console.log('🔄 راه‌اندازی سیستم پینگ خودکار...');
    
    // پینگ هر 13 دقیقه
    setInterval(async () => {
      try {
        const response = await axios.get(`${RENDER_URL}/health`);
        console.log('✅ پینگ موفق:', new Date().toLocaleTimeString('fa-IR'));
      } catch (error) {
        console.log('❌ خطا در پینگ:', error.message);
      }
    }, 13 * 60 * 1000); // 13 دقیقه

    // پینگ اولیه
    setTimeout(async () => {
      try {
        await axios.get(`${RENDER_URL}/health`);
        console.log('✅ اولین پینگ ارسال شد');
      } catch (error) {
        console.log('❌ خطا در اولین پینگ:', error.message);
      }
    }, 5000);
  } else {
    console.log('⚠️ آدرس RENDER_URL تنظیم نشده - پینگ غیرفعال');
  }
};

// ==================[ سیستم محدودیت نرخ ]==================
const rateLimit = new Map();

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userRequests = rateLimit.get(userId) || [];
  
  const recentRequests = userRequests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= 10) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(userId, recentRequests);
  return true;
};

// ==================[ سیستم لاگ‌گیری ]==================
const logActivity = async (type, details, userId = null, chatId = null) => {
  try {
    await supabase
      .from('Eclis_activity_logs')
      .insert({
        activity_type: type,
        details: details,
        user_id: userId,
        chat_id: chatId,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.log('❌ خطا در لاگ فعالیت:', error.message);
  }
};

// ==================[ مدیریت استیکرها ]==================
const getSticker = async (stickerType) => {
  try {
    const { data, error } = await supabase
      .from('Eclis_stickers')
      .select('sticker_file_id')
      .eq('sticker_type', stickerType)
      .single();

    if (error || !data) {
      return null;
    }

    return data.sticker_file_id;
  } catch (error) {
    console.log('❌ خطا در دریافت استیکر:', error.message);
    return null;
  }
};

const setSticker = async (stickerType, stickerFileId) => {
  try {
    const { error } = await supabase
      .from('Eclis_stickers')
      .upsert({
        sticker_type: stickerType,
        sticker_file_id: stickerFileId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sticker_type' });

    if (error) {
      console.log('❌ خطا در ذخیره استیکر:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('❌ خطا در ذخیره استیکر:', error.message);
    return false;
  }
};

// ==================[ مدیریت خطاها ]==================
bot.catch((err, ctx) => {
  console.log(`❌ خطا در ربات:`, err);
  logActivity('bot_error', { error: err.message }, ctx.from?.id, ctx.chat?.id);
});

// ==================[ میدلور مدیریت خطاهای عمومی ]==================
bot.use(async (ctx, next) => {
  if (ctx.from && !checkRateLimit(ctx.from.id)) {
    await ctx.reply('⏳ لطفاً کمی صبر کنید و سپس دوباره امتحان کنید...', {
      reply_to_message_id: ctx.message?.message_id
    });
    return;
  }

  try {
    await next();
  } catch (error) {
    console.log('❌ خطا در پردازش درخواست:', error.message);
    
    try {
      await supabase
        .from('Eclis_errors')
        .insert({
          error_message: error.message,
          user_id: ctx.from?.id,
          chat_id: ctx.chat?.id,
          created_at: new Date().toISOString()
        });
    } catch (dbError) {
      console.log('❌ خطا در ذخیره خطا:', dbError.message);
    }
    
    if (ctx.from && ctx.from.id === OWNER_ID) {
      try {
        await ctx.reply(`❌ خطا در پردازش دستور:\n${error.message.substring(0, 1000)}`, {
          reply_to_message_id: ctx.message?.message_id
        });
      } catch (replyError) {
        console.log('❌ خطا در ارسال پیام خطا:', replyError.message);
      }
    }
  }
});

// ==================[ بررسی مالکیت ]==================
const checkOwnerAccess = (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return { hasAccess: false, message: 'کاربر شناسایی نشد' };
  }
  
  const owners = [OWNER_ID];
  if (!owners.includes(userId)) {
    return { hasAccess: false, message: 'من فقط از اربابم پیروی میکنم 🥷🏻' };
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
    
    const { data: existingChat, error: checkError } = await supabase
      .from('Eclis_subgroups')
      .select('chat_id')
      .eq('chat_id', chatId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.log('❌ خطا در بررسی چت موجود:', checkError);
      return false;
    }

    if (existingChat) {
      console.log(`⚠️ چت ${chatId} از قبل وجود دارد`);
      const { error: updateError } = await supabase
        .from('Eclis_subgroups')
        .update({
          chat_title: chatTitle,
          chat_type: chatType,
          is_active: true,
          last_checked: new Date().toISOString()
        })
        .eq('chat_id', chatId);

      if (updateError) {
        console.log('❌ خطا در آپدیت چت:', updateError);
        return false;
      }
      
      console.log(`✅ اطلاعات چت آپدیت شد: ${chatTitle}`);
      return true;
    }

    const { error } = await supabase
      .from('Eclis_subgroups')
      .insert({
        chat_id: chatId,
        chat_title: chatTitle,
        chat_type: chatType,
        added_by: addedBy,
        added_at: new Date().toISOString(),
        last_checked: new Date().toISOString(),
        is_active: true
      });

    if (error) {
      console.log('❌ خطا در ذخیره چت جدید:', error);
      return false;
    }
    
    console.log(`✅ چت جدید اضافه شد: ${chatTitle}`);
    return true;
    
  } catch (error) {
    console.log('❌ خطا در افزودن چت:', error.message);
    return false;
  }
};

const getActiveSubgroups = async () => {
  try {
    const { data, error } = await supabase
      .from('Eclis_subgroups')
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
    
    // کشف چت‌های جدید از طریق آپدیت‌ها
    try {
      console.log('🔍 بررسی آپدیت‌های اخیر برای کشف چت‌های جدید...');
      
      const updates = await ctx.telegram.getUpdates({
        offset: 0,
        limit: 50,
        timeout: 1
      });
      
      let lastUpdateId = 0;
      if (updates.length > 0) {
        lastUpdateId = updates[updates.length - 1].update_id;
      }
      
      const recentUpdates = await ctx.telegram.getUpdates({
        offset: lastUpdateId + 1,
        limit: 100,
        timeout: 2
      });
      
      const processedChats = new Set();
      
      for (const update of [...updates, ...recentUpdates]) {
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
                // ربات در چت نیست
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
    const addedBy = ctx.myChatMember.from.id;
    
    console.log(`🤖 وضعیت ربات در چت ${chat.title}: ${chatMember.status}`);
    
    // اگر ربات اضافه شده
    if (chatMember.status === 'administrator' || chatMember.status === 'member') {
      // اگر توسط مالک اضافه شده
      if (addedBy === OWNER_ID) {
        try {
          const currentMember = await ctx.telegram.getChatMember(chatId, bot.botInfo.id);
          
          if (currentMember.status === 'administrator' || currentMember.status === 'creator') {
            const chatType = chat.type === 'channel' ? 'کانال' : 'گروه';
            const chatTitle = chat.title || 'بدون عنوان';
            
            const added = await addChatToSubgroups(chatId, chatTitle, chatType, OWNER_ID);
            
            if (added) {
              console.log(`✅ چت جدید توسط مالک اضافه شد: ${chatTitle} (${chatType})`);
              
              // ارسال پیام تایید
              await ctx.reply('🥷🏻 این بخش به بخش های تحت نظارت نینجای چهارم اضافه شد');
              
              // ارسال استیکر اگر تنظیم شده
              const stickerId = await getSticker('added_by_owner');
              if (stickerId) {
                await ctx.replyWithSticker(stickerId);
              }
            }
          }
        } catch (error) {
          console.log(`❌ خطا در بررسی چت ${chatId}:`, error.message);
        }
      } else {
        // اگر توسط غیرمالک اضافه شده
        console.log(`🚫 ربات توسط غیرمالک (${addedBy}) به چت ${chat.title} اضافه شد`);
        
        // ارسال پیام هشدار
        await ctx.reply('🚫 این ربات متعلق به مجموعه بزرگ Eclis است و جز آکی کسی نمیتونه به من دستور بده');
        
        // لفت دادن از گروه
        try {
          await ctx.telegram.leaveChat(chatId);
          console.log(`✅ ربات از چت ${chat.title} لفت داد`);
        } catch (leaveError) {
          console.log(`❌ خطا در لفت دادن از چت:`, leaveError.message);
        }
      }
    }
    
  } catch (error) {
    console.log('❌ خطا در پردازش my_chat_member:', error.message);
  }
});

// ==================[ سیستم مدیریت کاربران جدید ]==================
const checkUserApproval = async (userId) => {
  try {
    // بررسی اینکه کاربر توسط مالک تایید شده یا نه
    const { data: approvedUser, error } = await supabase
      .from('Eclis_approved_users')
      .select('user_id, approved_by, approved_at')
      .eq('user_id', userId)
      .eq('is_approved', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.log('❌ خطا در بررسی کاربر تایید شده:', error);
      return { approved: false, reason: 'خطا در بررسی' };
    }

    if (approvedUser) {
      return { approved: true, reason: 'تایید شده توسط مالک' };
    }

    return { approved: false, reason: 'نیاز به تایید مالک' };
  } catch (error) {
    console.log('❌ خطا در بررسی تایید کاربر:', error.message);
    return { approved: false, reason: 'خطا در بررسی' };
  }
};

// ==================[ هندلر برای کاربران جدید در گروه اصلی ]==================
bot.on('new_chat_members', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    
    // فقط در گروه اصلی عمل کن
    if (chatId !== MAIN_GROUP_ID) {
      return;
    }

    const newMembers = ctx.message.new_chat_members;
    
    for (const member of newMembers) {
      // اگر ربات خودش باشه، صرف نظر کن
      if (member.id === bot.botInfo.id) {
        continue;
      }

      // ارسال پیام سوال برای مالک
      const questionMessage = await ctx.reply(
        `مسافر [${member.first_name || 'بدون نام'}](tg://user?id=${member.id}) به Eclis وارد شده\n\n` +
        `[آکی](tg://user?id=${OWNER_ID}) آیا این مسافر اجازه ورود به Eclis را داره ؟`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'آره ، اجازه ورود داره', callback_data: `approve_${member.id}` },
                { text: 'نه ، اجازه ورود نداره', callback_data: `reject_${member.id}` }
              ]
            ]
          }
        }
      );

      // ذخیره اطلاعات کاربر منتظر تایید
      await supabase
        .from('Eclis_pending_users')
        .upsert({
          user_id: member.id,
          username: member.username || '',
          first_name: member.first_name || 'ناشناس',
          chat_id: chatId,
          question_message_id: questionMessage.message_id,
          joined_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      // سکوت کاربر تا زمان تایید
      try {
        const untilDate = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7); // 7 روز
        await ctx.telegram.restrictChatMember(chatId, member.id, {
          until_date: untilDate,
          permissions: {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false
          }
        });
        console.log(`🔇 کاربر ${member.first_name} سکوت شد تا زمان تایید`);
      } catch (restrictError) {
        console.log(`❌ خطا در سکوت کاربر ${member.id}:`, restrictError.message);
      }
    }
  } catch (error) {
    console.log('❌ خطا در پردازش کاربران جدید:', error.message);
  }
});

// ==================[ هندلر برای پیام‌های کاربران تایید نشده ]==================
bot.on('message', async (ctx) => {
  try {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    
    // فقط در گروه اصلی عمل کن
    if (chatId !== MAIN_GROUP_ID) {
      return;
    }

    // اگر کاربر مالک است، نیاز به بررسی نیست
    if (userId === OWNER_ID) {
      return;
    }

    // بررسی اینکه کاربر تایید شده یا نه
    const approvalCheck = await checkUserApproval(userId);
    
    if (!approvalCheck.approved) {
      // حذف پیام کاربر
      try {
        await ctx.deleteMessage();
      } catch (deleteError) {
        console.log(`❌ خطا در حذف پیام کاربر ${userId}:`, deleteError.message);
      }

      // ارسال پیام هشدار
      const warningMessage = await ctx.reply(
        `مسافر [${ctx.from.first_name || 'بدون نام'}](tg://user?id=${userId}) شما اجازه صحبت ندارین تا زمانی که تایید بشین`,
        { parse_mode: 'Markdown' }
      );

      // حذف پیام هشدار بعد از 5 ثانیه
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(chatId, warningMessage.message_id);
        } catch (e) {}
      }, 5000);
    }
  } catch (error) {
    console.log('❌ خطا در پردازش پیام کاربر:', error.message);
  }
});

// ==================[ هندلر برای دکمه‌های اینلاین ]==================
bot.action(/approve_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    const chatId = ctx.chat.id.toString();
    
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    // تایید کاربر
    await supabase
      .from('Eclis_approved_users')
      .upsert({
        user_id: userId,
        approved_by: OWNER_ID,
        approved_at: new Date().toISOString(),
        is_approved: true
      }, { onConflict: 'user_id' });

    // حذف کاربر از لیست منتظران
    await supabase
      .from('Eclis_pending_users')
      .delete()
      .eq('user_id', userId);

    // برداشتن سکوت کاربر
    try {
      await ctx.telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        }
      });
    } catch (restrictError) {
      console.log(`❌ خطا در برداشتن سکوت کاربر ${userId}:`, restrictError.message);
    }

    // دریافت اطلاعات کاربر
    let userInfo = '';
    try {
      const user = await ctx.telegram.getChat(userId);
      userInfo = user.first_name || 'کاربر';
    } catch (error) {
      userInfo = 'کاربر';
    }

    // ارسال پیام تایید
    await ctx.editMessageText(
      `✅ مسافر ${userInfo} به Eclis خوش اومدی`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery('کاربر تایید شد');

  } catch (error) {
    console.log('❌ خطا در تایید کاربر:', error.message);
    await ctx.answerCbQuery('خطا در تایید کاربر');
  }
});

bot.action(/reject_(\d+)/, async (ctx) => {
  try {
    const userId = parseInt(ctx.match[1]);
    
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    // اخراج کاربر از گروه اصلی
    try {
      await ctx.telegram.banChatMember(MAIN_GROUP_ID, userId);
      await ctx.telegram.unbanChatMember(MAIN_GROUP_ID, userId);
    } catch (banError) {
      console.log(`❌ خطا در اخراج کاربر ${userId}:`, banError.message);
    }

    // حذف کاربر از لیست منتظران
    await supabase
      .from('Eclis_pending_users')
      .delete()
      .eq('user_id', userId);

    // دریافت اطلاعات کاربر
    let userInfo = '';
    try {
      const user = await ctx.telegram.getChat(userId);
      userInfo = user.first_name || 'کاربر';
    } catch (error) {
      userInfo = 'کاربر';
    }

    // ارسال پیام رد
    await ctx.editMessageText(
      `🚫 مسافر ${userInfo} از Eclis با موفقیت خارج شد`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery('کاربر اخراج شد');

  } catch (error) {
    console.log('❌ خطا در رد کاربر:', error.message);
    await ctx.answerCbQuery('خطا در رد کاربر');
  }
});

// ==================[ سیستم بررسی وفاداری ]==================
const scanAllSubgroupsMembers = async (ctx) => {
  try {
    console.log('🔍 شروع اسکن اعضای چت‌ها برای وفاداری...');
    
    const subgroups = await getActiveSubgroups();
    let totalMembersScanned = 0;
    let loyalMembers = 0;
    let suspiciousMembers = 0;
    
    const loyalList = [];
    const suspiciousList = [];

    for (const subgroup of subgroups) {
      try {
        console.log(`🔍 اسکن ${subgroup.chat_type}: ${subgroup.chat_title}`);
        
        let members = [];
        
        // دریافت ادمین‌های چت
        const admins = await ctx.telegram.getChatAdministrators(subgroup.chat_id);
        const adminUsers = admins.map(admin => admin.user).filter(user => !user.is_bot);
        
        // دریافت تمام اعضای چت (برای گروه‌ها)
        if (subgroup.chat_type === 'گروه') {
          try {
            // این قسمت نیاز به دسترسی ویژه دارد
            // فعلاً فقط ادمین‌ها را بررسی می‌کنیم
            members = adminUsers;
          } catch (error) {
            console.log(`⚠️ دسترسی به لیست کامل اعضای گروه ${subgroup.chat_title} ممکن نیست`);
            members = adminUsers;
          }
        } else {
          // برای کانال‌ها فقط ادمین‌ها
          members = adminUsers;
        }
        
        for (const member of members) {
          // بررسی اینکه کاربر مدیر هست یا نه (مدیران مشکوک محسوب نمی‌شوند)
          const isAdmin = adminUsers.some(admin => admin.id === member.id);
          
          const hasSymbol = checkLoyaltySymbols(member.first_name) || checkLoyaltySymbols(member.username);

          if (hasSymbol) {
            loyalMembers++;
            loyalList.push({
              user_id: member.id,
              username: member.username,
              first_name: member.first_name,
              chat_title: subgroup.chat_title,
              is_admin: isAdmin
            });
          } else if (!isAdmin) { // فقط اگر مدیر نیست، مشکوک محسوب شود
            suspiciousMembers++;
            suspiciousList.push({
              user_id: member.id,
              username: member.username,
              first_name: member.first_name,
              chat_title: subgroup.chat_title
            });
          }
          
          totalMembersScanned++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`✅ ${subgroup.chat_title}: ${members.length} عضو اسکن شد`);
        
      } catch (error) {
        console.log(`❌ خطا در اسکن ${subgroup.chat_type} "${subgroup.chat_title}":`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ اسکن وفاداری کامل شد: ${totalMembersScanned} عضو اسکن شد`);
    
    return { 
      success: true, 
      totalScanned: totalMembersScanned,
      loyalMembers: loyalMembers,
      suspiciousMembers: suspiciousMembers,
      loyalList: loyalList,
      suspiciousList: suspiciousList
    };
    
  } catch (error) {
    console.log('❌ خطا در اسکن وفاداری:', error.message);
    return { 
      success: false, 
      totalScanned: 0,
      loyalMembers: 0,
      suspiciousMembers: 0,
      loyalList: [],
      suspiciousList: []
    };
  }
};

// ==================[ دستور بررسی وفاداری ]==================
bot.command('بررسی_وفاداری', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const tempMessage = await ctx.reply('🔍 در حال بررسی وفاداری اعضا... این ممکن است چند دقیقه طول بکشد.', {
      reply_to_message_id: ctx.message.message_id
    });

    const scanResult = await scanAllSubgroupsMembers(ctx);
    
    if (!scanResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}
      return ctx.reply('❌ خطا در بررسی وفاداری اعضا.', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const { totalScanned, loyalMembers, suspiciousMembers, suspiciousList } = scanResult;

    let message = `🎯 نتایج بررسی وفاداری\n\n`;
    message += `📊 آمار کلی:\n`;
    message += `• کل اعضای اسکن شده: ${totalScanned}\n`;
    message += `• اعضای وفادار: ${loyalMembers} 👑\n`;
    message += `• اعضای مشکوک: ${suspiciousMembers} ⚠️\n\n`;
    
    message += `آیا میخوای تمام اعضای مشکوک توی Eclis رو بکشم ؟`;

    try {
      await ctx.deleteMessage(tempMessage.message_id);
    } catch (e) {}

    const resultMessage = await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'آره ، همشون رو بکش', callback_data: 'ban_suspicious' },
            { text: 'نه ، نکششون', callback_data: 'dont_ban_suspicious' }
          ]
        ]
      }
    });

    // ذخیره لیست مشکوک‌ها برای استفاده بعدی
    await supabase
      .from('Eclis_temp_data')
      .upsert({
        key: 'suspicious_list',
        data: { suspiciousList: suspiciousList },
        created_at: new Date().toISOString()
      }, { onConflict: 'key' });

    // ارسال استیکر بررسی وفاداری
    const stickerId = await getSticker('loyalty_scan');
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
    }

  } catch (error) {
    console.log('❌ خطا در دستور بررسی وفاداری:', error.message);
    await ctx.reply('❌ خطا در بررسی وفاداری اعضا.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ هندلر برای بن کردن اعضای مشکوک ]==================
bot.action('ban_suspicious', async (ctx) => {
  try {
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    await ctx.answerCbQuery('در حال بن کردن اعضای مشکوک...');

    // دریافت لیست مشکوک‌ها
    const { data: tempData, error } = await supabase
      .from('Eclis_temp_data')
      .select('data')
      .eq('key', 'suspicious_list')
      .single();

    if (error || !tempData) {
      await ctx.editMessageText('❌ لیست مشکوک‌ها پیدا نشد');
      return;
    }

    const suspiciousList = tempData.data.suspiciousList || [];
    let bannedCount = 0;
    let errorCount = 0;

    // بن کردن هر کاربر مشکوک از تمام گروه‌ها
    for (const user of suspiciousList) {
      try {
        const subgroups = await getActiveSubgroups();
        
        for (const subgroup of subgroups) {
          try {
            await ctx.telegram.banChatMember(subgroup.chat_id, user.user_id);
            console.log(`✅ کاربر ${user.first_name} از ${subgroup.chat_title} بن شد`);
          } catch (banError) {
            console.log(`❌ خطا در بن کردن کاربر ${user.user_id} از ${subgroup.chat_title}:`, banError.message);
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        bannedCount++;
      } catch (userError) {
        errorCount++;
        console.log(`❌ خطا در پردازش کاربر ${user.user_id}:`, userError.message);
      }
    }

    await ctx.editMessageText(
      `✅ تمام افراد مشکوک با استفاده از تیغه های زیبام با نهایت لذت یکی یکی کشته میشن\n\n` +
      `📊 نتیجه:\n` +
      `• تعداد بن شده: ${bannedCount}\n` +
      `• خطاها: ${errorCount}`
    );

    // ارسال استیکر بن کردن
    const stickerId = await getSticker('ban_suspicious');
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
    }

  } catch (error) {
    console.log('❌ خطا در بن کردن اعضای مشکوک:', error.message);
    await ctx.answerCbQuery('خطا در بن کردن اعضای مشکوک');
  }
});

bot.action('dont_ban_suspicious', async (ctx) => {
  try {
    // فقط مالک می‌تواند عمل کند
    if (ctx.from.id !== OWNER_ID) {
      await ctx.answerCbQuery('فقط آکی میتونه این کار رو بکنه!');
      return;
    }

    await ctx.answerCbQuery('اعضای مشکوک بن نشدند');

    await ctx.editMessageText('🔄 فرصتی دوباره...\n\nاعضای مشکوک میتونن تا دفعه بعدی زنده بمونن');

    // ارسال استیکر عدم بن
    const stickerId = await getSticker('dont_ban_suspicious');
    if (stickerId) {
      await ctx.replyWithSticker(stickerId);
    }

  } catch (error) {
    console.log('❌ خطا در عمل عدم بن:', error.message);
    await ctx.answerCbQuery('خطا در انجام عمل');
  }
});

// ==================[ دستور تنظیم استیکر ]==================
bot.command('setsticker', async (ctx) => {
  try {
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
      return ctx.reply('💡 لطفاً یک استیکر را ریپلای کنید و دستور را به این صورت استفاده کنید:\n/setsticker <نوع_استیکر>', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('💡 استفاده: /setsticker <نوع_استیکر>\n\nانواع استیکر:\n- added_by_owner (اضافه شدن به گروه توسط مالک)\n- loyalty_scan (بررسی وفاداری)\n- ban_suspicious (بن کردن مشکوک‌ها)\n- dont_ban_suspicious (بن نکردن مشکوک‌ها)', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const stickerType = args[1];
    const stickerFileId = ctx.message.reply_to_message.sticker.file_id;

    const validTypes = ['added_by_owner', 'loyalty_scan', 'ban_suspicious', 'dont_ban_suspicious'];
    if (!validTypes.includes(stickerType)) {
      return ctx.reply('❌ نوع استیکر نامعتبر است. انواع معتبر:\n\n- added_by_owner\n- loyalty_scan\n- ban_suspicious\n- dont_ban_suspicious', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const success = await setSticker(stickerType, stickerFileId);
    
    if (success) {
      await ctx.reply(`✅ استیکر برای ${stickerType} با موفقیت تنظیم شد`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await ctx.reply('❌ خطا در تنظیم استیکر', {
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.log('❌ خطا در تنظیم استیکر:', error.message);
    await ctx.reply('❌ خطا در تنظیم استیکر', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ دستورات اصلی ]==================
bot.start(async (ctx) => {
  try {
    console.log('🚀 دستور /start دریافت شد');
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }
    
    await ctx.reply('🥷🏻 ربات مدیریت Eclis فعال است\n\nاز /help برای راهنما استفاده کنید', {
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.log('❌ خطا در دستور start:', error.message);
  }
});

bot.command('help', async (ctx) => {
  try {
    console.log('ℹ️ دستور /help دریافت شد');
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }
    
    const helpText = `🥷🏻 راهنمای ربات مدیریت Eclis

📋 دستورات:
/update_chats - کشف و بروزرسانی چت‌ها
/add_chat - افزودن دستی چت
/بررسی_وفاداری - بررسی نماد وفاداری اعضا
/setsticker - تنظیم استیکر برای رویدادها
/groups - لیست گروه‌ها
/status - وضعیت ربات

💡 نکات:
- کاربران جدید باید در گروه اصلی تایید شوند
- ربات به صورت خودکار چت‌های جدید را تشخیص می‌دهد
- فقط اعضای دارای نماد وفاداری ایمن هستند`;

    await ctx.reply(helpText, {
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.log('❌ خطا در دستور help:', error.message);
  }
});

bot.command('status', async (ctx) => {
  try {
    console.log('📊 دستور /status دریافت شد');
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }
    
    const subgroups = await getActiveSubgroups();
    
    const message = `🤖 وضعیت ربات مدیریت Eclis

📊 آمار:
• گروه‌های فعال: ${subgroups.length}
• زمان فعالیت: ${Math.round(process.uptime() / 60)} دقیقه
• آخرین پینگ: ${new Date().toLocaleTimeString('fa-IR')}

✅ ربات در حال اجرا است`;

    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.log('❌ خطا در دستور status:', error.message);
  }
});

bot.command('groups', async (ctx) => {
  try {
    console.log('🏘️ دستور /groups دریافت شد');
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    const subgroups = await getActiveSubgroups();
    
    if (subgroups.length === 0) {
      return ctx.reply('📭 هیچ گروه فعالی پیدا نشد', {
        reply_to_message_id: ctx.message.message_id
      });
    }

    let message = `🏘️ گروه‌های فعال (${subgroups.length}):\n\n`;
    
    subgroups.forEach((group, index) => {
      message += `${index + 1}. ${group.chat_title} (${group.chat_type})\n`;
      message += `   ID: ${group.chat_id}\n\n`;
    });

    await ctx.reply(message, {
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.log('❌ خطا در دستور groups:', error.message);
  }
});

// ==================[ دستور اصلی: بروزرسانی وضعیت چت‌ها ]==================
bot.command('update_chats', async (ctx) => {
  try {
    console.log('🔄 دستور /update_chats دریافت شد');
    const access = checkOwnerAccess(ctx);
    if (!access.hasAccess) {
      return ctx.reply(access.message, {
        reply_to_message_id: ctx.message.message_id
      });
    }

    await logActivity('update_chats_started', {}, ctx.from.id, ctx.chat.id);

    const tempMessage = await ctx.reply('🔄 در حال کشف و بروزرسانی تمام چت‌ها...', {
      reply_to_message_id: ctx.message.message_id
    });
    
    const discoveryResult = await discoverAdminChats(ctx);
    
    if (!discoveryResult.success) {
      try {
        await ctx.deleteMessage(tempMessage.message_id);
      } catch (e) {}
      await logActivity('update_chats_failed', { error: 'Discovery failed' }, ctx.from.id, ctx.chat.id);
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

    await logActivity('update_chats_completed', discoveryResult, ctx.from.id, ctx.chat.id);

  } catch (error) {
    console.log('❌ خطا در بروزرسانی چت‌ها:', error.message);
    await logActivity('update_chats_error', { error: error.message }, ctx.from.id, ctx.chat.id);
    await ctx.reply('❌ خطا در بروزرسانی چت‌ها.', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ دستور اضافه کردن دستی چت ]==================
bot.command('add_chat', async (ctx) => {
  try {
    console.log('➕ دستور /add_chat دریافت شد');
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
            await logActivity('add_chat_success', { chatId, chatTitle, chatType }, ctx.from.id, ctx.chat.id);
            await ctx.reply(`✅ ${chatType} "${chatTitle}" با موفقیت اضافه شد`, {
              reply_to_message_id: ctx.message.message_id
            });
          } else {
            await logActivity('add_chat_failed', { chatId, error: 'Database error' }, ctx.from.id, ctx.chat.id);
            await ctx.reply('❌ خطا در ذخیره چت', {
              reply_to_message_id: ctx.message.message_id
            });
          }
        } else {
          await logActivity('add_chat_not_admin', { chatId }, ctx.from.id, ctx.chat.id);
          await ctx.reply('❌ ربات در این چت ادمین نیست', {
            reply_to_message_id: ctx.message.message_id
          });
        }
      } catch (error) {
        await logActivity('add_chat_error', { chatId, error: error.message }, ctx.from.id, ctx.chat.id);
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
    await logActivity('add_chat_command_error', { error: error.message }, ctx.from.id, ctx.chat.id);
    await ctx.reply('❌ خطا در افزودن چت', {
      reply_to_message_id: ctx.message.message_id
    });
  }
});

// ==================[ راه‌اندازی ربات ]==================
const startBot = async () => {
  try {
    console.log('🤖 شروع راه‌اندازی ربات...');
    
    // بررسی وضعیت ربات
    const botInfo = await bot.telegram.getMe();
    console.log(`✅ ربات ${botInfo.username} شناسایی شد`);
    console.log(`🆔 ID ربات: ${botInfo.id}`);
    console.log(`👤 نام ربات: ${botInfo.first_name}`);
    
    // راه‌اندازی ربات با پولینگ
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'chat_member', 'my_chat_member', 'new_chat_members', 'callback_query'],
      polling: {
        timeout: 30,
        limit: 100,
        allowedUpdates: ['message', 'chat_member', 'my_chat_member', 'new_chat_members', 'callback_query']
      }
    });
    
    console.log('✅ ربات با موفقیت فعال شد');
    console.log('📝 ربات آماده دریافت دستورات است...');
    
    // اطلاع به مالک
    try {
      await bot.telegram.sendMessage(
        OWNER_ID, 
        `🤖 ربات ${botInfo.first_name} فعال شد\n\n` +
        `⏰ زمان: ${new Date().toLocaleString('fa-IR')}\n` +
        `🆔 ID: ${botInfo.id}\n` +
        `👤 یوزرنیم: @${botInfo.username}\n\n` +
        `✅ ربات آماده دریافت دستورات است`
      );
    } catch (error) {
      console.log('⚠️ نتوانستم به مالک اطلاع دهم:', error.message);
    }
    
  } catch (error) {
    console.log('❌ خطا در راه‌اندازی ربات:', error.message);
    console.log('🔧 بررسی کنید که BOT_TOKEN صحیح باشد');
    process.exit(1);
  }
};

// ==================[ سرور اکسپرس برای سلامت ]==================
app.get('/', (req, res) => {
  res.json({ 
    status: '✅ ربات فعال است',
    service: 'Eclis Management Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'Eclis Management Bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/ping', (req, res) => {
  res.json({ 
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

// ==================[ راه‌اندازی سرور ]==================
app.listen(PORT, () => {
  console.log(`✅ سرور روی پورت ${PORT} راه‌اندازی شد`);
  
  // راه‌اندازی ربات
  startBot();
  
  // راه‌اندازی سیستم پینگ خودکار
  startPingService();
});

// ==================[ مدیریت خاموشی ]==================
process.once('SIGINT', () => {
  console.log('🛑 دریافت SIGINT - خاموش کردن ربات...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 دریافت SIGTERM - خاموش کردن ربات...');
  bot.stop('SIGTERM');
  process.exit(0);
});

// هندل خطاهای catch نشده
process.on('uncaughtException', (error) => {
  console.log('❌ خطای catch نشده:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Promise رد شده catch نشده:', reason);
});
