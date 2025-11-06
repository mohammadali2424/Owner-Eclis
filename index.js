const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const express = require('express');

// اطلاعات توکن و کلید از متغیرهای محیطی
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GATEWAY_GROUP_ID = parseInt(process.env.GATEWAY_GROUP_ID);
const OWNER_ID = parseInt(process.env.OWNER_ID);

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

// ذخیره استیکر
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

// ارسال استیکر
async function sendSticker(chatId, type) {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .select('file_id')
            .eq('type', type)
            .single();
        
        if (error || !data) {
            console.warn(`⚠️ استیکر ${type} تنظیم نشده است`);
            return false;
        }
        
        await bot.telegram.sendSticker(chatId, data.file_id);
        return true;
    } catch (error) {
        console.error('خطا در ارسال استیکر:', error);
        return false;
    }
}

// بازیابی اطلاعات کاربر از جدول pending_approvals در Supabase
async function getPendingApproval(userId) {
    try {
        const { data, error } = await supabase
            .from('pending_approvals')
            .select('*')
            .eq('user_id', userId)
            .single(); // فقط یک رکورد

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('خطا در دریافت کاربر در انتظار تایید:', error);
        return null;
    }
}

// ذخیره‌سازی اطلاعات کاربر تایید شده
async function saveApprovedUser(userId, userData) {
    try {
        const { error } = await supabase
            .from('approved_users')
            .upsert({
                user_id: userId,
                user_name: userData.userName,
                username: userData.username,
                approved_at: new Date().toISOString(),
                approved_by: OWNER_ID
            });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('خطا در ذخیره کاربر تایید شده:', error);
        return false;
    }
}

// ذخیره‌سازی کاربر در انتظار تایید
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

// حذف کاربر از انتظار تایید
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

// ========================== دستورات اصلی ربات ==========================

// وقتی مالک پیام "شروع" ارسال می‌کند
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        // بررسی اینکه آیا پیام مالک ریپلای شده است یا نه
        if (ctx.message.reply_to_message) {
            // فقط پیام را ارسال کن، استیکر ارسال نشود
            await ctx.reply('در خدمت شمام ارباب');
        } else {
            // پیام و استیکر را ارسال کن
            await ctx.reply('در خدمت شمام ارباب');
            await sendSticker(ctx.chat.id, 'start');
        }
    }
});

// وقتی کاربر وارد گروه دروازه می‌شود
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    const newStatus = chatMember.new_chat_member.status;

    if (chatId === GATEWAY_GROUP_ID && (newStatus === 'member' || newStatus === 'administrator')) {
        // زمانی که کاربر وارد گروه دروازه می‌شود
        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        const message = `مسافر ${userName} وارد اکلیس شد\nارباب ${userName} آیا این غریبه اجازه ورود به اکلیس رو داره؟`;
        
        const sentMessage = await bot.telegram.sendMessage(OWNER_ID, message, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'آره ، میتونه وارد شه', callback_data: `approve_${user.id}` },
                        { text: 'نه ، اجازه ورود نداره', callback_data: `reject_${user.id}` }
                    ]
                ]
            }
        });

        // ذخیره کردن پیام تایید
        await savePendingApproval(user.id, { userName, username: user.username }, sentMessage.message_id);
    }
});

// تایید یا رد کاربر
bot.on('callback_query', async (ctx) => {
    try {
        const data = ctx.callbackQuery.data;
        const userId = parseInt(data.split('_')[1]);

        if (data.startsWith('approve_')) {
            // تایید کاربر
            const userData = await getPendingApproval(userId);
            await saveApprovedUser(userId, userData);
            await removePendingApproval(userId);

            // خوش آمدگویی
            await bot.telegram.sendMessage(GATEWAY_GROUP_ID, `مسافر ${userData.user_name} به جهان بزرگ اکلیس خوش آمدید!`);
            await sendSticker(GATEWAY_GROUP_ID, 'welcome');
        } else if (data.startsWith('reject_')) {
            // رد کاربر و بن کردن
            const userData = await getPendingApproval(userId);
            await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
            await removePendingApproval(userId);

            await bot.telegram.sendMessage(GATEWAY_GROUP_ID, `غریبه ${userData.user_name} از هال اکلیس بیرون رانده شد`);
            await sendSticker(GATEWAY_GROUP_ID, 'reject');
        }
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('خطا در مدیریت callback_query:', error);
    }
});

// مدیریت پیام‌های قبل از تایید
bot.on('message', async (ctx) => {
    const userId = ctx.from.id;
    const userData = await getPendingApproval(userId);

    if (userData) {
        // اگر کاربر تایید نشده است
        await ctx.deleteMessage(); // پیام را پاک می‌کنیم
        await ctx.reply(`مسافر ${userData.user_name} شما تا قبل از تایید ارباب اجازه انجام هیچ حرکتیو نداری`);
        await bot.telegram.restrictChatMember(ctx.chat.id, userId, { can_send_messages: false });
    }
});

// حذف کاربر از همه گروه‌ها وقتی از دروازه لفت می‌دهد
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    const oldStatus = chatMember.old_chat_member.status;
    const newStatus = chatMember.new_chat_member.status;

    if (chatId === GATEWAY_GROUP_ID && (oldStatus === 'member' || oldStatus === 'administrator') && newStatus === 'left') {
        // زمانی که کاربر گروه دروازه را ترک کرده باشد
        const protectedGroups = await getProtectedGroups();
        for (const group of protectedGroups) {
            await bot.telegram.banChatMember(group.group_id, user.id);
        }

        await bot.telegram.sendMessage(GATEWAY_GROUP_ID, `مسافر ${user.first_name} از اکلیس بیرون رفت و از تمام گروه‌های زیرمجموعه بن شد`);
    }
});

// مدیریت نفوذی‌ها و ارسال گزارش به گروه
async function banIntruder(user, groupId) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const joinTime = new Date().toLocaleString('fa-IR');
    await bot.telegram.banChatMember(groupId, user.id);
    
    const report = `🚨 هشدار امنیتی!\n\n👤 کاربر: ${userName}\n🆔 آیدی: ${user.id}\n⏰ زمان: ${joinTime}\n\nاین کاربر بدون عبور از دروازه اصلی قصد نفوذ داشت که شکار و حذف شد.`;
    await bot.telegram.sendMessage(OWNER_ID, report);
    await sendSticker(OWNER_ID, 'intruder');
}

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

// راهنمای دستورات
bot.command('help', async (ctx) => {
    const helpText = `
    📚 راهنمای دستورات ربات:

    /start - شروع ربات
    /liststickers - نمایش وضعیت استیکرها
    /setsticker [نوع] - تنظیم استیکر جدید
    /approvedusers - نمایش لیست کاربران تایید شده
    /addgroup [گروه] - اضافه کردن گروه به لیست مناطق تحت حفاظت
    /removegroup [گروه] - حذف گروه از لیست مناطق تحت حفاظت
    /help - نمایش راهنمای دستورات ربات
    `;
    
    await ctx.reply(helpText);
});

// شروع ربات
async function startBot() {
    await bot.launch();
    console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
}

startBot();
