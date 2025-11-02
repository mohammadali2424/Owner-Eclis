const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// تنظیمات اصلی - اینجا اطلاعات خودت رو وارد کن
const BOT_TOKEN = 'توکن_ربات_تو_اینجا_وارد_کن';
const SUPABASE_URL = 'آدرس_سوپابیس_تو_اینجا_وارد_کن';
const SUPABASE_KEY = 'کلید_سوپابیس_تو_اینجا_وارد_کن';
const GATEWAY_GROUP_ID = -1001234567890; // آیدی عددی گروه دروازه
const OWNER_ID = 123456789; // آیدی عددی خودت رو اینجا وارد کن

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// متغیرهای سیستمی
let approvedUsers = new Set();
let otherGroups = [];

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

// مدیریت دستور "شروع"
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        await ctx.reply('🛡️ ربات نینجای چهار فعال شد!\n\nامنیت مجموعه Eclis اکنون تحت کنترل است.');
        console.log('✅ ربات توسط مالک فعال شد');
    }
});

// نظارت بر عضویت در گروه‌ها
bot.on('chat_member', async (ctx) => {
    const chatMember = ctx.chatMember;
    const user = chatMember.new_chat_member.user;
    const chatId = chatMember.chat.id;
    
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
    
    // اگر کاربر سعی در جوین شدن دارد
    if (newStatus === 'member' || newStatus === 'administrator') {
        const isApproved = approvedUsers.has(user.id);
        const inGateway = await checkUserInGateway(user.id);
        
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
    } catch (error) {
        console.error('خطا در ارسال درخواست تایید:', error);
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
        console.error('خطا در بن کردن کاربر:', error);
    }
}

// بررسی حضور کاربر در گروه دروازه
async function checkUserInGateway(userId) {
    try {
        const member = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
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
        console.log(`🚨 نفوذی ${user.id} شناسایی و بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن نفوذی:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    approvedUsers.delete(user.id);
    
    // بن کردن از تمام گروه‌های دیگر
    for (const groupId of otherGroups) {
        try {
            await bot.telegram.banChatMember(groupId, user.id);
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
    } catch (error) {
        console.error('خطا در راه‌اندازی ربات:', error);
    }
}

// مدیریت خاموشی
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

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
