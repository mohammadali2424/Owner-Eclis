const { Telegraf } = require('telegraf');
const http = require('http');
const express = require('express');

// تنظیمات اصلی - وارد شده توسط شما
const BOT_TOKEN = '8135660826:AAHpqzFlEsy_rWcGjWMqvv-KCvE7tzUuT0I'; // باید توکن واقعی رو از @BotFather بگیرید
const SUPABASE_URL = 'https://phdwvxyglwnlqjciipgr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHd2eHlnbHdubHFqY2lpcGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTU5MzUsImV4cCI6MjA3NTU3MTkzNX0.__c_CZk7vv9KIiPuDiTpWdblXeHwBo69z88x4vReTtQ';
const GATEWAY_GROUP_ID = -1002483328877; // گروه دروازه
const OWNER_ID = 7495437597; // آیدی شما

// ایجاد سرور برای پینگ
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🛡️ ربات نینجای چهار فعال است - امنیت Eclis برقرار است');
});

app.listen(PORT, () => {
    console.log(`🚀 سرور پینگ روی پورت ${PORT} فعال شد`);
});

// پینگ هر 14 دقیقه
setInterval(() => {
    console.log('🔄 پینگ ارسال شد - ربات فعال است');
}, 14 * 60 * 1000);

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// متغیرهای سیستمی
let approvedUsers = new Set();
let otherGroups = [
    -1002000000001, // گروه نمونه 1
    -1002000000002, // گروه نمونه 2
    -1002000000003, // گروه نمونه 3
    // بقیه گروه‌ها و کانال‌ها رو اینجا اضافه کنید
];

// تابع برای اضافه کردن گروه‌های جدید
function addGroup(groupId) {
    if (!otherGroups.includes(groupId)) {
        otherGroups.push(groupId);
        console.log(`✅ گروه جدید اضافه شد: ${groupId}`);
    }
}

// تابع برای حذف گروه
function removeGroup(groupId) {
    otherGroups = otherGroups.filter(id => id !== groupId);
    console.log(`❌ گروه حذف شد: ${groupId}`);
}

// تابع برای دریافت لیست گروه‌ها
function getGroups() {
    return otherGroups;
}

// مدیریت دستور "شروع" - فقط برای مالک
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        await ctx.reply('🛡️ ربات نینجای چهار فعال شد!\n\nامنیت مجموعه Eclis اکنون تحت کنترل است.');
        console.log('✅ ربات توسط مالک فعال شد');
        
        // ارسال پیام به گروه دروازه
        try {
            await bot.telegram.sendMessage(
                GATEWAY_GROUP_ID,
                '🛡️ سیستم امنیتی نینجای چهار فعال شد\n\nتمام ورودها تحت نظارت است'
            );
        } catch (error) {
            console.log('⚠️ ارسال پیام به گروه دروازه امکان‌پذیر نبود');
        }
    } else {
        // اگر کاربر دیگر دستور شروع داد
        await ctx.reply('❌ فقط مالک ربات می‌تواند این دستور را اجرا کند');
    }
});

// نظارت بر عضویت در گروه‌ها
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    
    console.log(`🔍 فعالیت کاربر ${user.id} در چت ${chatId}`);

    // اگر گروه دروازه باشد
    if (chatId === GATEWAY_GROUP_ID) {
        await handleGatewayActivity(chatMember);
    }
    // اگر از گروه‌های دیگر باشد
    else if (otherGroups.includes(chatId)) {
        await handleOtherGroupActivity(chatMember);
    }
});

// مدیریت فعالیت در گروه دروازه
async function handleGatewayActivity(chatMember) {
    const user = chatMember.new_chat_member.user;
    const oldStatus = chatMember.old_chat_member.status;
    const newStatus = chatMember.new_chat_member.status;
    
    console.log(`🚪 کاربر ${user.id} در دروازه - وضعیت قدیم: ${oldStatus}, وضعیت جدید: ${newStatus}`);

    // کاربر جدید جوین شده
    if ((newStatus === 'member' || newStatus === 'administrator') && 
        (oldStatus === 'left' || oldStatus === 'kicked')) {
        await askOwnerForApproval(user);
    }
    
    // کاربر لفت داده یا اخراج شده
    if ((newStatus === 'left' || newStatus === 'kicked') && 
        (oldStatus === 'member' || oldStatus === 'administrator')) {
        await handleUserLeftGateway(user);
    }
}

// مدیریت فعالیت در گروه‌های دیگر
async function handleOtherGroupActivity(chatMember) {
    const user = chatMember.new_chat_member.user;
    const newStatus = chatMember.new_chat_member.status;
    const chatId = chatMember.chat.id;
    
    console.log(`🔒 بررسی کاربر ${user.id} در گروه ${chatId}`);

    // اگر کاربر سعی در جوین شدن دارد
    if (newStatus === 'member' || newStatus === 'administrator') {
        const isApproved = approvedUsers.has(user.id);
        const inGateway = await checkUserInGateway(user.id);
        
        console.log(`👤 کاربر ${user.id} - تایید شده: ${isApproved}, در دروازه: ${inGateway}`);

        if (!isApproved || !inGateway) {
            await banIntruder(user, chatId);
        }
    }
}

// درخواست تایید از مالک
async function askOwnerForApproval(user) {
    const userInfo = `
👤 کاربر جدید در دروازه:

📛 نام: ${user.first_name} ${user.last_name || ''}
🆔 عددی: ${user.id}
👤 یوزرنیم: @${user.username || 'ندارد'}
⏰ زمان: ${new Date().toLocaleString('fa-IR')}
    `;
    
    try {
        await bot.telegram.sendMessage(
            OWNER_ID,
            userInfo,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { 
                                text: '✅ تایید کاربر', 
                                callback_data: `approve_${user.id}` 
                            },
                            { 
                                text: '❌ رد و بن', 
                                callback_data: `reject_${user.id}` 
                            }
                        ]
                    ]
                }
            }
        );
        console.log(`📨 درخواست تایید برای کاربر ${user.id} ارسال شد`);
    } catch (error) {
        console.error('❌ خطا در ارسال درخواست تایید:', error);
    }
}

// مدیریت دکمه‌های تایید و رد
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    if (ctx.from.id !== OWNER_ID) {
        await ctx.answerCbQuery('❌ فقط مالک می‌تواند این کار را انجام دهد');
        return;
    }
    
    if (data.startsWith('approve_')) {
        const userId = parseInt(data.split('_')[1]);
        await approveUser(userId, ctx);
    } 
    else if (data.startsWith('reject_')) {
        const userId = parseInt(data.split('_')[1]);
        await rejectUser(userId, ctx);
    }
});

// تایید کاربر
async function approveUser(userId, ctx) {
    approvedUsers.add(userId);
    await ctx.answerCbQuery('✅ کاربر تایید شد');
    await ctx.editMessageText(
        ctx.callbackQuery.message.text + '\n\n✅ وضعیت: تایید شده توسط مالک'
    );
    console.log(`✅ کاربر ${userId} تایید شد`);
    
    // ارسال پیام خوش‌آمد به کاربر
    try {
        await bot.telegram.sendMessage(
            userId,
            '🎉 تایید شدید!\n\nاکنون می‌توانید به گروه‌ها و کانال‌های مجموعه Eclis دسترسی داشته باشید.'
        );
    } catch (error) {
        console.log('⚠️ ارسال پیام به کاربر امکان‌پذیر نبود');
    }
}

// رد و بن کاربر
async function rejectUser(userId, ctx) {
    try {
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        await ctx.answerCbQuery('❌ کاربر بن شد');
        await ctx.editMessageText(
            ctx.callbackQuery.message.text + '\n\n❌ وضعیت: رد و بن شده توسط مالک'
        );
        console.log(`❌ کاربر ${userId} بن شد`);
    } catch (error) {
        console.error('❌ خطا در بن کردن کاربر:', error);
    }
}

// بررسی حضور کاربر در گروه دروازه
async function checkUserInGateway(userId) {
    try {
        const member = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        const isInGateway = member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
        console.log(`🔎 بررسی دروازه برای ${userId}: ${isInGateway}`);
        return isInGateway;
    } catch (error) {
        console.error('❌ خطا در بررسی حضور کاربر در دروازه:', error);
        return false;
    }
}

// بن کردن نفوذی
async function banIntruder(user, groupId) {
    try {
        // بن کردن از گروه
        await bot.telegram.banChatMember(groupId, user.id);
        
        // ارسال گزارش به مالک
        const report = `
🚨 شناسایی نفوذی!

📛 نام: ${user.first_name} ${user.last_name || ''}
🆔 عددی: ${user.id}
👤 یوزرنیم: @${user.username || 'ندارد'}
⏰ زمان: ${new Date().toLocaleString('fa-IR')}

🛡️ نفوذی هایی تشخیص داده شدن ، اما متوحه حضورم نشدن و کشته شدن ، امنیت اکلیس برقراره 
        `;
        
        await bot.telegram.sendMessage(OWNER_ID, report);
        console.log(`🚨 نفوذی ${user.id} شناسایی و بن شد از گروه ${groupId}`);
    } catch (error) {
        console.error('❌ خطا در بن کردن نفوذی:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    approvedUsers.delete(user.id);
    
    console.log(`🚶 کاربر ${user.id} از دروازه خارج شد - حذف از لیست تایید شده‌ها`);

    // بن کردن از تمام گروه‌های دیگر
    for (const groupId of otherGroups) {
        try {
            await bot.telegram.banChatMember(groupId, user.id);
            console.log(`✅ کاربر ${user.id} از گروه ${groupId} بن شد`);
        } catch (error) {
            // ممکن است کاربر در گروه نباشد
        }
    }
    
    console.log(`✅ کاربر ${user.id} از تمام گروه‌ها حذف شد`);
}

// راه‌اندازی ربات
async function startBot() {
    try {
        await bot.launch();
        console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
        console.log('📍 منتظر دستور "شروع" از طرف مالک...');
        console.log(`👤 مالک: ${OWNER_ID}`);
        console.log(`🚪 گروه دروازه: ${GATEWAY_GROUP_ID}`);
        console.log(`🔒 تعداد گروه‌های تحت حفاظت: ${otherGroups.length}`);
        
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error);
    }
}

// مدیریت خاموشی
process.once('SIGINT', () => {
    console.log('🛑 ربات در حال خاموش شدن...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('🛑 ربات در حال خاموش شدن...');
    bot.stop('SIGTERM');
});

// صادر کردن توابع برای استفاده در فایل‌های دیگر
module.exports = {
    bot,
    addGroup,
    removeGroup,
    getGroups,
    approvedUsers,
    startBot
};

// شروع ربات
startBot();
