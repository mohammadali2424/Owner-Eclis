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

// وقتی مالک پیام "شروع" ارسال می‌کند
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        // ارسال پیام "در خدمت شمام ارباب"
        await ctx.reply('در خدمت شمام ارباب');
        // ارسال استیکر قابل تنظیم
        await sendSticker(ctx.chat.id, 'start');
    }
});

// بررسی ورود کاربر به گروه دروازه
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
        // کاربر تایید نشده است
        await ctx.deleteMessage();
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

// شروع ربات
async function startBot() {
    await bot.launch();
    console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
}

startBot();
