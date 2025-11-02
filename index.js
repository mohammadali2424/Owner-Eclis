const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const express = require('express');

// تنظیمات اصلی
const BOT_TOKEN = '8135660826:AAHpqzFlEsy_rWcGjWMqvv-KCvE7tzUuT0I';
const SUPABASE_URL = 'https://phdwvxyglwnlqjciipgr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHd2eHlnbHdubHFqY2lpcGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTU5MzUsImV4cCI6MjA3NTU3MTkzNX0.__c_CZk7vv9KIiPuDiTpWdblXeHwBo69z88x4vReTtQ';
const GATEWAY_GROUP_ID = -1002483328877;
const OWNER_ID = 7495437597;

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
    http.get(`http://localhost:${PORT}`, (res) => {
        console.log('🔄 پینگ ارسال شد - ربات فعال است');
    });
}, 14 * 60 * 1000);

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// متغیرهای سیستمی
let approvedUsers = new Set();
let pendingApprovals = new Map();
let stickers = new Map();

// لیست گروه‌ها و کانال‌های زیرمجموعه - اینجا رو با آیدی واقعی پر کنید
let otherGroups = [
    -1002929172320,
    -1003147693863,
    -1002842462894,
];

// تابع برای ذخیره استیکر در دیتابیس
async function saveSticker(type, fileId) {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .upsert({ type, file_id: fileId });
        
        if (error) throw error;
        stickers.set(type, fileId);
        return true;
    } catch (error) {
        console.error('خطا در ذخیره استیکر:', error);
        return false;
    }
}

// تابع برای دریافت استیکر از دیتابیس
async function loadStickers() {
    try {
        const { data, error } = await supabase
            .from('stickers')
            .select('*');
        
        if (error) throw error;
        
        stickers.clear();
        data.forEach(item => {
            stickers.set(item.type, item.file_id);
        });
        console.log('✅ استیکرها از دیتابیس بارگذاری شدند');
    } catch (error) {
        console.error('خطا در بارگذاری استیکرها:', error);
    }
}

// ارسال استیکر بر اساس نوع
async function sendSticker(chatId, type) {
    const fileId = stickers.get(type);
    if (fileId) {
        try {
            await bot.telegram.sendSticker(chatId, fileId);
            return true;
        } catch (error) {
            console.error('خطا در ارسال استیکر:', error);
            return false;
        }
    }
    return false;
}

// ========================== دستورات مدیریتی ==========================

// دستور تنظیم استیکر
bot.command('setsticker', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        return await ctx.reply('❌ فقط مالک می‌تواند استیکر تنظیم کند');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return await ctx.reply('⚠️ فرمت دستور:\n/setsticker [نوع]\n\nانواع استیکر:\nstart - شروع\nwelcome - خوش آمدگویی\nreject - رد کاربر\nintruder - نفوذی\nkill - کشتن کاربر\nareas - مناطق');
    }

    const type = args[1];
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
    
    stickerTypes.forEach(type => {
        const hasSticker = stickers.has(type.key);
        message += `${hasSticker ? '✅' : '❌'} ${type.name} (${type.key})\n`;
    });

    message += '\n💡 برای تنظیم استیکر از دستور /setsticker [نوع] استفاده کنید';
    await ctx.reply(message);
});

// دستور بررسی مناطق
bot.command('checkareas', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    await ctx.reply('🔍 در حال بررسی مناطق تحت حفاظت...');

    const allGroups = [GATEWAY_GROUP_ID, ...otherGroups];
    let successCount = 0;
    let failCount = 0;
    
    for (const groupId of allGroups) {
        try {
            await bot.telegram.sendMessage(groupId, '🛡️ این منطقه تحت نظارت منه');
            await sendSticker(groupId, 'areas');
            successCount++;
            console.log(`✅ پیام به گروه ${groupId} ارسال شد`);
        } catch (error) {
            failCount++;
            console.error(`❌ خطا در ارسال به گروه ${groupId}:`, error.message);
        }
    }

    await ctx.reply(`✅ بررسی مناطق کامل شد\n\n✅ موفق: ${successCount}\n❌ ناموفق: ${failCount}`);
});

// دستور لیست مناطق
bot.command('listareas', async (ctx) => {
    if (ctx.chat.id !== GATEWAY_GROUP_ID) {
        return await ctx.reply('❌ این دستور فقط در گروه دروازه کار می‌کند');
    }

    let message = '🗺️ مناطق تحت حفاظت من:\n\n';
    message += `📍 گروه دروازه (اصلی) - ${GATEWAY_GROUP_ID}\n\n`;

    if (otherGroups.length > 0) {
        message += '🛡️ گروه‌ها و کانال‌های زیرمجموعه:\n';
        otherGroups.forEach((groupId, index) => {
            message += `${index + 1}. ${groupId}\n`;
        });
    } else {
        message += '⚠️ هیچ گروه زیرمجموعه‌ای تعریف نشده است\n';
    }

    message += `\n📊 تعداد کل مناطق: ${otherGroups.length + 1}`;
    
    await ctx.reply(message);
});

// دستور اضافه کردن گروه
bot.command('addgroup', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return await ctx.reply('⚠️ فرمت دستور:\n/addgroup [آیدی_گروه]');
    }

    const groupId = parseInt(args[1]);
    if (isNaN(groupId)) {
        return await ctx.reply('❌ آیدی گروه باید عددی باشد');
    }

    if (!otherGroups.includes(groupId)) {
        otherGroups.push(groupId);
        await ctx.reply(`✅ گروه ${groupId} به لیست مناطق تحت حفاظت اضافه شد`);
        console.log(`✅ گروه جدید اضافه شد: ${groupId}`);
    } else {
        await ctx.reply('⚠️ این گروه قبلاً اضافه شده است');
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

    const index = otherGroups.indexOf(groupId);
    if (index > -1) {
        otherGroups.splice(index, 1);
        await ctx.reply(`✅ گروه ${groupId} از لیست مناطق تحت حفاظت حذف شد`);
        console.log(`❌ گروه حذف شد: ${groupId}`);
    } else {
        await ctx.reply('❌ این گروه در لیست وجود ندارد');
    }
});

// ========================== مدیریت کاربران ==========================

// مدیریت دستور "شروع"
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        // ریپلای کردن پیام
        await ctx.reply('نینجای چهار در خدمت شماست', {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر شروع
        await sendSticker(ctx.chat.id, 'start');
        
        console.log('✅ ربات توسط مالک فعال شد');
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

        // اگر کاربر جدید به گروه دروازه پیوست
        if (chatId === GATEWAY_GROUP_ID && 
            (newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked')) {
            
            await handleNewUserInGateway(user);
        }
        
        // اگر کاربر از گروه دروازه خارج شد
        if (chatId === GATEWAY_GROUP_ID && 
            (newStatus === 'left' || newStatus === 'kicked') && 
            (oldStatus === 'member' || oldStatus === 'administrator')) {
            
            await handleUserLeftGateway(user);
        }
        
        // اگر کاربر به گروه‌های دیگر پیوست
        if (otherGroups.includes(chatId) && 
            (newStatus === 'member' || newStatus === 'administrator')) {
            
            await handleUserInOtherGroups(user, chatId);
        }
    } catch (error) {
        console.error('خطا در مدیریت chat_member:', error);
    }
});

// مدیریت کاربر جدید در دروازه
async function handleNewUserInGateway(user) {
    // اگر کاربر مدیر است، نیاز به تایید ندارد
    if (user.id === OWNER_ID) {
        approvedUsers.add(user.id);
        return;
    }

    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    
    const messageText = `مسافر ${userName} وارد هال اکلیس شد\n\nارباب این شخص اجازه ورود به اکلیس رو داره؟`;
    
    // ذخیره کاربر در انتظار تایید
    pendingApprovals.set(user.id, {
        userName,
        username: user.username,
        userId: user.id,
        joinTime: new Date()
    });
    
    // ارسال پیام به مالک
    await bot.telegram.sendMessage(
        OWNER_ID,
        messageText,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ اره، اجازه ورود داره', callback_data: `approve_${user.id}` },
                        { text: '❌ نه، اجازه ورود نداره', callback_data: `reject_${user.id}` }
                    ]
                ]
            }
        }
    );
    
    // ارسال پیام به گروه دروازه
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `👤 مسافر ${userName} وارد هال شد...`
    );
}

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

// تایید کاربر
async function approveUser(userId, ctx) {
    const userData = pendingApprovals.get(userId);
    if (!userData) {
        await ctx.answerCbQuery('❌ کاربر یافت نشد');
        return;
    }
    
    approvedUsers.add(userId);
    pendingApprovals.delete(userId);
    
    await ctx.answerCbQuery('✅ کاربر تایید شد');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ وضعیت: تایید شد');
    
    // ارسال پیام خوش آمدگویی به گروه دروازه
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `🎉 مسافر ${userData.userName} به جهان بزرگ اکلیس خوش اومدی`
    );
    
    // ارسال استیکر خوش آمدگویی
    await sendSticker(GATEWAY_GROUP_ID, 'welcome');
    
    console.log(`✅ کاربر ${userId} تایید شد`);
}

// رد کاربر
async function rejectUser(userId, ctx) {
    const userData = pendingApprovals.get(userId);
    if (!userData) {
        await ctx.answerCbQuery('❌ کاربر یافت نشد');
        return;
    }
    
    pendingApprovals.delete(userId);
    
    try {
        // بن کردن از گروه دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        await ctx.answerCbQuery('❌ کاربر بن شد');
        await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ وضعیت: رد و بن شد');
        
        // ارسال پیام به گروه دروازه
        await bot.telegram.sendMessage(
            GATEWAY_GROUP_ID,
            `❌ ${userData.userName} از اکلیس بیرون رانده شد`
        );
        
        // ارسال استیکر رد
        await sendSticker(GATEWAY_GROUP_ID, 'reject');
        
        console.log(`❌ کاربر ${userId} بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن کاربر:', error);
        await ctx.answerCbQuery('❌ خطا در بن کردن کاربر');
    }
}

// مدیریت کاربر در گروه‌های دیگر
async function handleUserInOtherGroups(user, groupId) {
    // اگر کاربر مالک است، اجازه دسترسی دارد
    if (user.id === OWNER_ID) return;

    const isApproved = approvedUsers.has(user.id);
    const inGateway = await checkUserInGateway(user.id);

    if (!isApproved || !inGateway) {
        await banIntruder(user, groupId);
    }
}

// بن کردن نفوذی
async function banIntruder(user, groupId) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const joinTime = new Date().toLocaleString('fa-IR');
    
    try {
        // بن کردن از گروه
        await bot.telegram.banChatMember(groupId, user.id);
        
        // ارسال گزارش به مالک
        const report = `🚨 مکرد مشکوک ${userName} در منطقه ${groupId} در تاریخ ${joinTime} قصد نفوذ داشت ، که با موفقیت پیدا ، شکار و کشته شد`;
        
        await bot.telegram.sendMessage(OWNER_ID, report);
        
        // ارسال استیکر نفوذی
        await sendSticker(OWNER_ID, 'intruder');
        
        console.log(`🚨 نفوذی ${user.id} در گروه ${groupId} شناسایی و بن شد`);
    } catch (error) {
        console.error('خطا در بن کردن نفوذی:', error);
    }
}

// مدیریت خروج کاربر از دروازه
async function handleUserLeftGateway(user) {
    // اگر کاربر مالک است، کاری نکن
    if (user.id === OWNER_ID) return;

    approvedUsers.delete(user.id);
    pendingApprovals.delete(user.id);
    
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

// بررسی حضور کاربر در گروه دروازه
async function checkUserInGateway(userId) {
    try {
        const member = await bot.telegram.getChatMember(GATEWAY_GROUP_ID, userId);
        return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        return false;
    }
}

// ========================== سیستم بن کردن ==========================

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

// بن کردن کاربر از تمام گروه‌ها
async function banUserFromAllGroups(user, ctx) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    
    try {
        // بن کردن از گروه دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, user.id);
        
        // بن کردن از تمام گروه‌های دیگر
        for (const groupId of otherGroups) {
            try {
                await bot.telegram.banChatMember(groupId, user.id);
            } catch (error) {
                // ممکن است کاربر در گروه نباشد
            }
        }
        
        approvedUsers.delete(user.id);
        pendingApprovals.delete(user.id);
        
        // ارسال پیام تأیید با ریپلای
        await ctx.reply(`✅ ${userName} با موفقیت کشته شد...`, {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر
        await sendSticker(ctx.chat.id, 'kill');
        
        console.log(`✅ کاربر ${user.id} از تمام گروه‌ها بن شد`);
    } catch (error) {
        await ctx.reply('❌ خطا در بن کردن کاربر');
        console.error('خطا در بن کردن کاربر:', error);
    }
}

// ========================== راه‌اندازی ربات ==========================

// راه‌اندازی ربات
async function startBot() {
    try {
        // بارگذاری استیکرها از دیتابیس
        await loadStickers();
        
        await bot.launch();
        console.log('🤖 ربات نینجای چهار راه‌اندازی شد');
        console.log('📍 منتظر فعالیت...');
        console.log(`👤 مالک: ${OWNER_ID}`);
        console.log(`🚪 گروه دروازه: ${GATEWAY_GROUP_ID}`);
        console.log(`🔒 تعداد گروه‌های تحت حفاظت: ${otherGroups.length}`);
        
        // ارسال پیام شروع به مالک
        await bot.telegram.sendMessage(OWNER_ID, '🛡️ ربات نینجای چهار فعال شد و آماده خدمت‌رسانی است');
        
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

// شروع ربات
startBot();
