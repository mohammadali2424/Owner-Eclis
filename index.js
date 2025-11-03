
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const express = require('express');

// تنظیمات از متغیرهای محیطی
const BOT_TOKEN = process.env.BOT_TOKEN || '8135660826:AAHpqzFlEsy_rWcGjWMqvv-KCvE7tzUuT0I';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://phdwvxyglwnlqjciipgr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHd2eHlnbHdubHFqY2lpcGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTU5MzUsImV4cCI6MjA3NTU3MTkzNX0.__c_CZk7vv9KIiPuDiTpWdblXeHwBo69z88x4vReTtQ';
const GATEWAY_GROUP_ID = parseInt(process.env.GATEWAY_GROUP_ID) || -1002483328877;
const OWNER_ID = parseInt(process.env.OWNER_ID) || 7495437597;

// ایجاد سرور برای پینگ
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.get('/', (req, res) => {
    res.json({ 
        status: 'active', 
        service: 'Ninja4 Bot',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 سرور پینگ روی پورت ${PORT} فعال شد`);
});

// پینگ هر 14 دقیقه
setInterval(() => {
    http.get(`http://localhost:${PORT}`, (res) => {
        console.log('🔄 پینگ سلامت ارسال شد');
    }).on('error', (err) => {
        console.error('❌ خطا در پینگ سلامت:', err.message);
    });
}, 14 * 60 * 1000);

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// مدیریت خطاهای Supabase
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        console.error('❌ اتصال به Supabase قطع شد');
    }
});

// ========================== سیستم ذخیره‌سازی دیتابیس ==========================

// تابع برای ذخیره استیکر
async function saveSticker(type, fileId) {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .upsert({ 
                type, 
                file_id: fileId,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در ذخیره استیکر:', error);
        return false;
    }
}

// تابع برای دریافت استیکر
async function getSticker(type) {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .select('file_id')
            .eq('type', type)
            .single();
        
        if (error) throw error;
        return data ? data.file_id : null;
    } catch (error) {
        console.error('خطا در دریافت استیکر:', error);
        return null;
    }
}

// تابع برای ذخیره کاربر تایید شده
async function saveApprovedUser(userId, userData, approvedBy = OWNER_ID) {
    try {
        const { error } = await supabase
            .from('approved_users')
            .upsert({
                user_id: userId,
                user_name: userData.userName,
                username: userData.username,
                approved_at: new Date().toISOString(),
                approved_by: approvedBy
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در ذخیره کاربر تایید شده:', error);
        return false;
    }
}

// تابع برای بررسی کاربر تایید شده
async function isUserApproved(userId) {
    try {
        const { data, error } = await supabase
            .from('approved_users')
            .select('user_id')
            .eq('user_id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        return !!data;
    } catch (error) {
        console.error('خطا در بررسی کاربر تایید شده:', error);
        return false;
    }
}

// تابع برای ذخیره کاربر در انتظار تایید
async function savePendingApproval(userId, userData, messageId = null) {
    try {
        const { error } = await supabase
            .from('pending_approvals')
            .upsert({
                user_id: userId,
                user_name: userData.userName,
                username: userData.username,
                join_time: new Date().toISOString(),
                message_id: messageId
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در ذخیره کاربر در انتظار:', error);
        return false;
    }
}

// تابع برای دریافت کاربر در انتظار تایید
async function getPendingApproval(userId) {
    try {
        const { data, error } = await supabase
            .from('pending_approvals')
            .select('*')
            .eq('user_id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    } catch (error) {
        console.error('خطا در دریافت کاربر در انتظار:', error);
        return null;
    }
}

// تابع برای حذف کاربر از انتظار تایید
async function removePendingApproval(userId) {
    try {
        const { error } = await supabase
            .from('pending_approvals')
            .delete()
            .eq('user_id', userId);
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در حذف کاربر از انتظار:', error);
        return false;
    }
}

// تابع برای دریافت لیست گروه‌های تحت حفاظت
async function getProtectedGroups() {
    try {
        const { data, error } = await supabase
            .from('protected_groups')
            .select('group_id, group_name');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('خطا در دریافت گروه‌های تحت حفاظت:', error);
        return [];
    }
}

// تابع برای اضافه کردن گروه تحت حفاظت
async function addProtectedGroup(groupId, groupName = null, addedBy = OWNER_ID) {
    try {
        const { error } = await supabase
            .from('protected_groups')
            .upsert({
                group_id: groupId,
                group_name: groupName,
                added_at: new Date().toISOString(),
                added_by: addedBy
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در اضافه کردن گروه:', error);
        return false;
    }
}

// تابع برای حذف گروه تحت حفاظت
async function removeProtectedGroup(groupId) {
    try {
        const { error } = await supabase
            .from('protected_groups')
            .delete()
            .eq('group_id', groupId);
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در حذف گروه:', error);
        return false;
    }
}

// ========================== عملکردهای اصلی ربات ==========================

// ارسال استیکر بر اساس نوع
async function sendSticker(chatId, type) {
    try {
        const fileId = await getSticker(type);
        if (!fileId) {
            console.warn(`⚠️ استیکر ${type} تنظیم نشده است`);
            return false;
        }
        
        await bot.telegram.sendSticker(chatId, fileId);
        return true;
    } catch (error) {
        console.error(`❌ خطا در ارسال استیکر ${type}:`, error.message);
        return false;
    }
}

// بررسی حضور کاربر در گروه دروازه
async function checkUserInGateway(userId) {
    try {
        const member = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        console.error('خطا در بررسی حضور کاربر در دروازه:', error.message);
        return false;
    }
}

// بررسی دسترسی ربات در گروه
async function checkBotPermissions(groupId) {
    try {
        const chatMember = await bot.telegram.getChatMember(groupId, bot.botInfo.id);
        return chatMember.can_restrict_members && chatMember.can_delete_messages;
    } catch (error) {
        console.error(`❌ خطا در بررسی دسترسی ربات در گروه ${groupId}:`, error.message);
        return false;
    }
}

// ========================== مدیریت کاربران ==========================

// مدیریت کاربر جدید در دروازه
async function handleNewUserInGateway(user) {
    try {
        // اگر کاربر مالک است، نیاز به تایید ندارد
        if (user.id === OWNER_ID) {
            await saveApprovedUser(user.id, {
                userName: user.first_name,
                username: user.username
            }, user.id);
            return;
        }

        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        
        // بررسی اینکه آیا کاربر قبلاً تایید شده است
        const isAlreadyApproved = await isUserApproved(user.id);
        if (isAlreadyApproved) {
            console.log(`✅ کاربر ${userName} قبلاً تایید شده است`);
            return;
        }

        // ارسال پیام به مالک برای تایید
        const messageText = `👤 مسافر جدید وارد هال اکلیس شد\n\n📍 نام: ${userName}\n🆔 آیدی: ${user.id}\n👤 یوزرنیم: @${user.username || 'ندارد'}\n\nارباب، این شخص اجازه ورود به اکلیس رو داره؟`;
        
        const sentMessage = await bot.telegram.sendMessage(
            OWNER_ID,
            messageText,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ بله، اجازه ورود دارد', callback_data: `approve_${user.id}` },
                            { text: '❌ خیر، اجازه ورود ندارد', callback_data: `reject_${user.id}` }
                        ],
                        [
                            { text: '🔍 مشاهده پروفایل', url: `tg://user?id=${user.id}` }
                        ]
                    ]
                }
            }
        );

        // ذخیره کاربر در انتظار تایید
        await savePendingApproval(user.id, {
            userName,
            username: user.username,
            userId: user.id
        }, sentMessage.message_id);
        
        // ارسال پیام به گروه دروازه
        await bot.telegram.sendMessage(
            GATEWAY_GROUP_ID,
            `👤 مسافر ${userName} وارد هال شد... در انتظار تایید ارباب`
        );
        
        console.log(`📥 کاربر جدید ${userName} (${user.id}) در انتظار تایید`);
        
    } catch (error) {
        console.error('خطا در مدیریت کاربر جدید:', error);
    }
}

// تایید کاربر
async function approveUser(userId, ctx) {
    try {
        const userData = await getPendingApproval(userId);
        if (!userData) {
            await ctx.answerCbQuery('❌ کاربر یافت نشد یا قبلاً پردازش شده است');
            return;
        }
        
        // ذخیره کاربر به عنوان تایید شده
        await saveApprovedUser(userId, userData);
        
        // حذف از لیست انتظار
        await removePendingApproval(userId);
        
        await ctx.answerCbQuery('✅ کاربر تایید شد');
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ وضعیت: تایید شد توسط ارباب');
        
        // ارسال پیام خوش آمدگویی به گروه دروازه
        await bot.telegram.sendMessage(
            GATEWAY_GROUP_ID,
            `🎉 مسافر ${userData.user_name} به جهان بزرگ اکلیس خوش اومدی!\n\nاکنون می‌توانی به تمام مناطق تحت حفاظت دسترسی داشته باشی.`
        );
        
        // ارسال استیکر خوش آمدگویی
        await sendSticker(GATEWAY_GROUP_ID, 'welcome');
        
        console.log(`✅ کاربر ${userData.user_name} (${userId}) تایید شد`);
        
    } catch (error) {
        console.error('خطا در تایید کاربر:', error);
        await ctx.answerCbQuery('❌ خطا در تایید کاربر');
    }
}

// رد کاربر
async function rejectUser(userId, ctx) {
    try {
        const userData = await getPendingApproval(userId);
        if (!userData) {
            await ctx.answerCbQuery('❌ کاربر یافت نشد یا قبلاً پردازش شده است');
            return;
        }
        
        // حذف از لیست انتظار
        await removePendingApproval(userId);
        
        // بن کردن از گروه دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        await ctx.answerCbQuery('❌ کاربر بن شد');
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ وضعیت: رد و بن شد توسط ارباب');
        
        // ارسال پیام به گروه دروازه
        await bot.telegram.sendMessage(
            GATEWAY_GROUP_ID,
            `❌ ${userData.user_name} از اکلیس بیرون رانده شد\n\nدستور ارباب اجرا شد.`
        );
        
        // ارسال استیکر رد
        await sendSticker(GATEWAY_GROUP_ID, 'reject');
        
        console.log(`❌ کاربر ${userData.user_name} (${userId}) بن شد`);
        
    } catch (error) {
        console.error('خطا در رد کاربر:', error);
        await ctx.answerCbQuery('❌ خطا در بن کردن کاربر');
    }
}

// بن کردن نفوذی از گروه‌های دیگر
async function banIntruder(user, groupId) {
    try {
        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        const joinTime = new Date().toLocaleString('fa-IR');
        
        // بن کردن از گروه
        await bot.telegram.banChatMember(groupId, user.id);
        
        // دریافت اطلاعات گروه
        let groupInfo = `گروه ${groupId}`;
        try {
            const chat = await bot.telegram.getChat(groupId);
            groupInfo = chat.title || groupInfo;
        } catch (error) {
            // اگر دریافت اطلاعات گروه با خطا مواجه شد، از آیدی استفاده می‌کنیم
        }
        
        // ارسال گزارش به مالک
        const report = `🚨 هشدار امنیتی!\n\n👤 کاربر: ${userName}\n🆔 آیدی: ${user.id}\n📌 منطقه: ${groupInfo}\n⏰ زمان: ${joinTime}\n\nاین کاربر بدون عبور از دروازه اصلی قصد نفوذ داشت که شکار و حذف شد.`;
        
        await bot.telegram.sendMessage(OWNER_ID, report);
        
        // ارسال استیکر نفوذی
        await sendSticker(OWNER_ID, 'intruder');
        
        console.log(`🚨 نفوذی ${user.id} در گروه ${groupId} شناسایی و بن شد`);
        
    } catch (error) {
        console.error('خطا در بن کردن نفوذی:', error);
    }
}

// بن کردن کاربر از تمام گروه‌ها
async function banUserFromAllGroups(user, ctx = null) {
    try {
        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        
        // بن کردن از گروه دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, user.id);
        
        // بن کردن از تمام گروه‌های تحت حفاظت
        const protectedGroups = await getProtectedGroups();
        for (const group of protectedGroups) {
            try {
                await bot.telegram.banChatMember(group.group_id, user.id);
                console.log(`✅ کاربر ${user.id} از گروه ${group.group_id} بن شد`);
            } catch (error) {
                // ممکن است کاربر در گروه نباشد یا دسترسی مشکل داشته باشد
                console.warn(`⚠️ خطا در بن کردن از گروه ${group.group_id}:`, error.message);
            }
        }
        
        // حذف از کاربران تایید شده
        const { error } = await supabase
            .from('approved_users')
            .delete()
            .eq('user_id', user.id);
        
        // حذف از انتظار تایید
        await removePendingApproval(user.id);
        
        if (ctx) {
            // ارسال پیام تأیید با ریپلای
            await ctx.reply(`✅ ${userName} با موفقیت از تمام مناطق حذف شد...`, {
                reply_to_message_id: ctx.message.message_id
            });
            
            // ارسال استیکر
            await sendSticker(ctx.chat.id, 'kill');
        }
        
        // اطلاع به مالک
        await bot.telegram.sendMessage(
            OWNER_ID,
            `🗑️ کاربر ${userName} (${user.id}) توسط دستور مستقیم از تمام مناطق حذف شد.`
        );
        
        console.log(`✅ کاربر ${user.id} از تمام گروه‌ها بن شد`);
        
    } catch (error) {
        console.error('خطا در بن کردن کاربر از تمام گروه‌ها:', error);
        if (ctx) {
            await ctx.reply('❌ خطا در بن کردن کاربر');
        }
    }
}

// ========================== دستورات مدیریتی ==========================

// دستور تنظیم استیکر
bot.command('setsticker', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        return await ctx.reply('❌ فقط مالک می‌تواند استیکر تنظیم کند');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return await ctx.reply('⚠️ فرمت دستور:\n/setsticker [نوع]\n\nانواع استیکر:\n• start - شروع\n• welcome - خوش آمدگویی\n• reject - رد کاربر\n• intruder - نفوذی\n• kill - کشتن کاربر\n• areas - مناطق');
    }

    const type = args[1];
    const validTypes = ['start', 'welcome', 'reject', 'intruder', 'kill', 'areas'];
    
    if (!validTypes.includes(type)) {
        return await ctx.reply(`❌ نوع استیکر نامعتبر است\n\nانواع مجاز: ${validTypes.join(', ')}`);
    }

    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
        return await ctx.reply('❌ لطفا روی یک استیکر ریپلای کنید');
    }

    const fileId = ctx.message.reply_to_message.sticker.file_id;
    const success = await saveSticker(type, fileId);

    if (success) {
        await ctx.reply(`✅ استیکر ${type} با موفقیت ذخیره شد`);
    } else {
        await ctx.reply('❌ خطا در ذخیره استیکر');
    }
});

// دستور لیست استیکرها
bot.command('liststickers', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    const stickerTypes = [
        { name: 'شروع', key: 'start' },
        { name: 'خوش آمدگویی', key: 'welcome' },
        { name: 'رد کاربر', key: 'reject' },
        { name: 'نفوذی', key: 'intruder' },
        { name: 'کشتن کاربر', key: 'kill' },
        { name: 'مناطق', key: 'areas' }
    ];

    let message = '📋 لیست استیکرهای تنظیم شده:\n\n';
    
    for (const type of stickerTypes) {
        const fileId = await getSticker(type.key);
        message += `${fileId ? '✅' : '❌'} ${type.name} (${type.key})\n`;
    }

    message += '\n💡 برای تنظیم استیکر از دستور /setsticker [نوع] استفاده کنید';
    await ctx.reply(message);
});

// دستور بررسی مناطق
bot.command('checkareas', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    await ctx.reply('🔍 در حال بررسی مناطق تحت حفاظت...');

    const protectedGroups = await getProtectedGroups();
    const allGroups = [{ group_id: GATEWAY_GROUP_ID, group_name: 'گروه دروازه' }, ...protectedGroups];
    
    let successCount = 0;
    let failCount = 0;
    let results = [];
    
    for (const group of allGroups) {
        try {
            // بررسی دسترسی ربات
            const hasPermission = await checkBotPermissions(group.group_id);
            if (!hasPermission) {
                results.push(`❌ ${group.group_name || group.group_id} - دسترسی ناکافی`);
                failCount++;
                continue;
            }

            await bot.telegram.sendMessage(group.group_id, '🛡️ این منطقه تحت نظارت منه');
            await sendSticker(group.group_id, 'areas');
            results.push(`✅ ${group.group_name || group.group_id} - فعال`);
            successCount++;
            
        } catch (error) {
            results.push(`❌ ${group.group_name || group.group_id} - ${error.message}`);
            failCount++;
        }
    }

    const report = `✅ بررسی مناطق کامل شد\n\n` +
                   `📊 نتیجه:\n` +
                   `✅ موفق: ${successCount}\n` +
                   `❌ ناموفق: ${failCount}\n\n` +
                   `📋 جزئیات:\n${results.join('\n')}`;
    
    await ctx.reply(report);
});

// دستور لیست مناطق
bot.command('listareas', async (ctx) => {
    if (ctx.chat.id !== GATEWAY_GROUP_ID && ctx.from.id !== OWNER_ID) {
        return await ctx.reply('❌ این دستور فقط در گروه دروازه یا توسط مالک کار می‌کند');
    }

    const protectedGroups = await getProtectedGroups();
    
    let message = '🗺️ مناطق تحت حفاظت من:\n\n';
    message += `📍 گروه دروازه (اصلی) - ${GATEWAY_GROUP_ID}\n\n`;

    if (protectedGroups.length > 0) {
        message += '🛡️ گروه‌ها و کانال‌های زیرمجموعه:\n';
        protectedGroups.forEach((group, index) => {
            message += `${index + 1}. ${group.group_name || group.group_id} - ${group.group_id}\n`;
        });
    } else {
        message += '⚠️ هیچ گروه زیرمجموعه‌ای تعریف نشده است\n';
    }

    message += `\n📊 تعداد کل مناطق: ${protectedGroups.length + 1}`;
    
    await ctx.reply(message);
});

// دستور اضافه کردن گروه
bot.command('addgroup', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return await ctx.reply('⚠️ فرمت دستور:\n/addgroup [آیدی_گروه] (نام_گروه)\n\nمثال:\n/addgroup -1001234567890\n/addgroup -1001234567890 "گروه اصلی"');
    }

    const groupId = parseInt(args[1]);
    if (isNaN(groupId) || groupId > 0) {
        return await ctx.reply('❌ آیدی گروه باید عددی منفی باشد (مثال: -1001234567890)');
    }

    const groupName = args.slice(2).join(' ') || null;

    // بررسی وجود گروه
    try {
        const chat = await bot.telegram.getChat(groupId);
        if (chat.type !== 'supergroup' && chat.type !== 'group') {
            return await ctx.reply('❌ فقط می‌توانید گروه‌های سوپرگروه اضافه کنید');
        }

        // بررسی دسترسی ربات
        const hasPermission = await checkBotPermissions(groupId);
        if (!hasPermission) {
            return await ctx.reply('❌ ربات در این گروه دسترسی لازم (بن کردن کاربران) را ندارد');
        }

    } catch (error) {
        return await ctx.reply('❌ گروه یافت نشد یا ربات عضو گروه نیست');
    }

    const success = await addProtectedGroup(groupId, groupName, ctx.from.id);
    if (success) {
        await ctx.reply(`✅ گروه ${groupName || groupId} به لیست مناطق تحت حفاظت اضافه شد`);
        console.log(`✅ گروه جدید اضافه شد: ${groupId}`);
    } else {
        await ctx.reply('❌ خطا در اضافه کردن گروه');
    }
});

// دستور حذف گروه
bot.command('removegroup', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return await ctx.reply('⚠️ فرمت دستور:\n/removegroup [آیدی_گروه]');
    }

    const groupId = parseInt(args[1]);
    if (isNaN(groupId)) {
        return await ctx.reply('❌ آیدی گروه باید عددی باشد');
    }

    const success = await removeProtectedGroup(groupId);
    if (success) {
        await ctx.reply(`✅ گروه ${groupId} از لیست مناطق تحت حفاظت حذف شد`);
        console.log(`❌ گروه حذف شد: ${groupId}`);
    } else {
        await ctx.reply('❌ این گروه در لیست وجود ندارد یا خطایی رخ داده است');
    }
});

// دستور لیست کاربران تایید شده
bot.command('approvedusers', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    try {
        const { data: users, error } = await supabase
            .from('approved_users')
            .select('*')
            .order('approved_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        if (!users || users.length === 0) {
            return await ctx.reply('📭 هیچ کاربر تایید شده‌ای وجود ندارد');
        }

        let message = '👥 لیست کاربران تایید شده:\n\n';
        users.forEach((user, index) => {
            const date = new Date(user.approved_at).toLocaleString('fa-IR');
            message += `${index + 1}. ${user.user_name} (${user.user_id})\n`;
            message += `   👤 @${user.username || 'ندارد'}\n`;
            message += `   ⏰ ${date}\n\n`;
        });

        message += `📊 تعداد کل: ${users.length} کاربر`;

        // اگر پیام طولانی است، آن را به چند قسمت تقسیم کنید
        if (message.length > 4096) {
            const parts = message.match(/[\s\S]{1,4096}/g) || [];
            for (const part of parts) {
                await ctx.reply(part);
            }
        } else {
            await ctx.reply(message);
        }

    } catch (error) {
        console.error('خطا در دریافت کاربران تایید شده:', error);
        await ctx.reply('❌ خطا در دریافت لیست کاربران');
    }
});

// ========================== مدیریت رویدادها ==========================

// مدیریت دستور "شروع"
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        // ریپلای کردن پیام
        await ctx.reply('🛡️ نینجای چهار در خدمت شماست، ارباب', {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر شروع
        await sendSticker(ctx.chat.id, 'start');
        
        console.log('✅ ربات توسط مالک فعال شد');
    }
});

// مدیریت کلیک روی دکمه‌های تایید
bot.on('callback_query', async (ctx) => {
    try {
        if (ctx.from.id !== OWNER_ID) {
            await ctx.answerCbQuery('❌ فقط مالک می‌تواند این کار را انجام دهد');
            return;
        }
        
        const data = ctx.callbackQuery.data;
        
        if (data.startsWith('approve_')) {
            const userId = parseInt(data.split('_')[1]);
            await approveUser(userId, ctx);
        } 
        else if (data.startsWith('reject_')) {
            const userId = parseInt(data.split('_')[1]);
            await rejectUser(userId, ctx);
        }
    } catch (error) {
        console.error('خطا در مدیریت callback_query:', error);
    }
});

// وقتی کاربر جدید به گروه دروازه می‌پیوندد
bot.on('chat_member', async (ctx) => {
    try {
        const chatMember = ctx.chatMember;
        const user = chatMember.new_chat_member.user;
        const chatId = chatMember.chat.id;
        const oldStatus = chatMember.old_chat_member.status;
        const newStatus = chatMember.new_chat_member.status;

        console.log(`👤 وضعیت کاربر ${user.id} در گروه ${chatId} تغییر کرد: ${oldStatus} -> ${newStatus}`);

        // اگر کاربر جدید به گروه دروازه پیوست
        if (chatId === GATEWAY_GROUP_ID && 
            (newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked' || oldStatus === 'restricted')) {
            
            await handleNewUserInGateway(user);
        }
        
        // اگر کاربر از گروه دروازه خارج شد
        if (chatId === GATEWAY_GROUP_ID && 
            (newStatus === 'left' || newStatus === 'kicked') && 
            (oldStatus === 'member' || oldStatus === 'administrator')) {
            
            await handleUserLeftGateway(user);
        }
        
        // اگر کاربر به گروه‌های دیگر پیوست
        const protectedGroups = await getProtectedGroups();
        const allProtectedGroups = protectedGroups.map(g => g.group_id);
        
        if (allProtectedGroups.includes(chatId) && 
            (newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked' || oldStatus === 'restricted')) {
            
            await handleUserInOtherGroups(user, chatId);
        }
    } catch (error) {
        console.error('خطا در مدیریت chat_member:', error);
    }
});

// مدیریت کاربر در گروه‌های دیگر
async function handleUserInOtherGroups(user, groupId) {
    try {
        // اگر کاربر مالک است، اجازه دسترسی دارد
        if (user.id === OWNER_ID) return;

        const isApproved = await isUserApproved(user.id);
        const inGateway = await checkUserInGateway(user.id);

        // اگر کاربر تایید نشده است یا در دروازه نیست، بن کن
        if (!isApproved || !inGateway) {
            await banIntruder(user, groupId);
        }
    } catch (error) {
        console.error('خطا در مدیریت کاربر در گروه‌های دیگر:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    try {
        // اگر کاربر مالک است، کاری نکن
        if (user.id === OWNER_ID) return;

        // حذف از کاربران تایید شده (اختیاری - بستگی به منطق کسب‌وکار دارد)
        // await removeApprovedUser(user.id);
        
        // حذف از انتظار تایید
        await removePendingApproval(user.id);
        
        console.log(`✅ کاربر ${user.id} از دروازه خارج شد`);
    } catch (error) {
        console.error('خطا در مدیریت خروج کاربر:', error);
    }
}

// دستور بن با ریپلای
bot.on('message', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    
    const message = ctx.message.text;
    
    // اگر پیام "بن" باشد و ریپلای شده باشد
    if (message === 'بن' && ctx.message.reply_to_message) {
        const targetUser = ctx.message.reply_to_message.from;
        
        // اگر کاربر مدیر است، بن نکن
        if (targetUser.id === OWNER_ID) {
            return await ctx.reply('❌ نمی‌توانید مالک را بن کنید');
        }
        
        await banUserFromAllGroups(targetUser, ctx);
        return;
    }
    
    // اگر پیام "بن @یوزرنیم" باشد
    if (message && message.startsWith('بن @')) {
        const username = message.split(' ')[0].replace('بن @', '').trim();
        if (username) {
            await ctx.reply(`🔍 در حال جستجوی کاربر @${username}...\n\n⚠️ این قابلیت نیاز به ریپلای دارد. لطفاً روی پیام کاربر ریپلای کنید و بنویسید "بن"`);
        }
        return;
    }
});

// ========================== راه‌اندازی و مدیریت خطا ==========================

// تابع اولیه‌سازی ربات
async function initializeBot() {
    try {
        console.log('🔧 در حال راه‌اندازی ربات...');
        
        // بررسی اتصال به دیتابیس
        const { data: stickers, error } = await supabase
            .from('stickers')
            .select('type')
            .limit(1);
        
        if (error) {
            throw new Error(`خطا در اتصال به دیتابیس: ${error.message}`);
        }
        
        // بررسی اتصال به تلگرام
        await bot.telegram.getMe();
        
        // بررسی دسترسی ربات در گروه دروازه
        const hasGatewayAccess = await checkBotPermissions(GATEWAY_GROUP_ID);
        if (!hasGatewayAccess) {
            console.warn('⚠️ ربات دسترسی لازم در گروه دروازه را ندارد');
        }
        
        console.log('✅ تمام اتصالات بررسی شدند');
        return true;
        
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error.message);
        return false;
    }
}

// راه‌اندازی ربات
async function startBot() {
    try {
        const initialized = await initializeBot();
        if (!initialized) {
            throw new Error('خطا در راه‌اندازی اولیه ربات');
        }
        
        await bot.launch();
        console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
        console.log('📍 منتظر فعالیت...');
        console.log(`👤 مالک: ${OWNER_ID}`);
        console.log(`🚪 گروه دروازه: ${GATEWAY_GROUP_ID}`);
        
        // دریافت تعداد گروه‌های تحت حفاظت
        const protectedGroups = await getProtectedGroups();
        console.log(`🔒 تعداد گروه‌های تحت حفاظت: ${protectedGroups.length}`);
        
        // ارسال پیام شروع به مالک
        await bot.telegram.sendMessage(
            OWNER_ID, 
            '🛡️ ربات نینجای چهار فعال شد و آماده خدمت‌رسانی است\n\n' +
            `📊 وضعیت:\n` +
            `• گروه دروازه: ${GATEWAY_GROUP_ID}\n` +
            `• گروه‌های تحت حفاظت: ${protectedGroups.length}\n` +
            `• سرور: پورت ${PORT}\n\n` +
            '💡 از دستور /listareas برای مشاهده مناطق استفاده کنید'
        );
        
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error);
        process.exit(1);
    }
}

// مدیریت خاموشی
process.once('SIGINT', () => {
    console.log('🛑 ربات در حال خاموش شدن...');
    bot.stop('SIGINT');
    server.close();
});

process.once('SIGTERM', () => {
    console.log('🛑 ربات در حال خاموش شدن...');
    bot.stop('SIGTERM');
    server.close();
});

// مدیریت خطاهای catch نشده
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ خطای catch نشده:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطای استثناء catch نشده:', error);
    process.exit(1);
});

// شروع ربات
startBot();
