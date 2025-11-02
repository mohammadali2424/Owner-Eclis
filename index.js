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
    res.send('ربات نینجای چهار فعال است - امنیت Eclis برقرار است');
});

app.listen(PORT, () => {
    console.log(`سرور پینگ روی پورت ${PORT} فعال شد`);
});

// پینگ هر 14 دقیقه
setInterval(() => {
    http.get(`http://localhost:${PORT}`, (res) => {
        console.log('پینگ ارسال شد - ربات فعال است');
    });
}, 14 * 60 * 1000);

// اتصال به دیتابیس
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Telegraf(BOT_TOKEN);

// متغیرهای سیستمی
let approvedUsers = new Set();
let pendingApprovals = new Map();
let stickers = new Map();
let groupNames = new Map();

// لیست گروه‌ها و کانال‌های زیرمجموعه
let otherGroups = [
    -1002929172320,
    -1002842462894, 
    -1003147693863,
];

// نام‌های گروه‌ها (برای گزارش نفوذ)
groupNames.set(GATEWAY_GROUP_ID, "گروه دروازه اصلی");
groupNames.set(-1003147693863, "منطقه امنیتی ۱");
groupNames.set(-1002842462894, "منطقه امنیتی ۲");
groupNames.set(-1002929172320, "کانال مرکزی");

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
        console.log('استیکرها از دیتابیس بارگذاری شدند');
    } catch (error) {
        console.error('خطا در بارگذاری استیکرها:', error);
    }
}

// تابع ارسال استیکر ایمن
async function sendSticker(ctx, type) {
    try {
        const fileId = stickers.get(type);
        if (!fileId) {
            console.log(`استیکر ${type} یافت نشد`);
            return false;
        }

        const chatId = ctx.chat?.id || ctx.message?.chat?.id || ctx.callbackQuery?.message?.chat?.id;
        if (!chatId) {
            console.log('چت آیدی یافت نشد');
            return false;
        }

        await bot.telegram.sendSticker(chatId, fileId);
        return true;
    } catch (error) {
        console.error(`خطا در ارسال استیکر ${type}:`, error.message);
        return false;
    }
}

// دستور برای تنظیم استیکر
bot.command('setsticker', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        return ctx.reply('فقط مالک می‌تواند استیکر تنظیم کند');
    }

    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('فرمت دستور:\n/setsticker [نوع] [ریپلای روی استیکر]\n\nانواع استیکر:\nstart - شروع\nwelcome - خوش آمدگویی\nreject - رد کاربر\nintruder - نفوذی\nkill - کشتن کاربر\nlist_areas - لیست مناطق\ncheck_areas - بررسی مناطق\nban - بن کاربر');
    }

    const type = args[1];
    if (!ctx.message.reply_to_message || !ctx.message.reply_to_message.sticker) {
        return ctx.reply('لطفا روی یک استیکر ریپلای کنید');
    }

    const fileId = ctx.message.reply_to_message.sticker.file_id;
    const success = await saveSticker(type, fileId);

    if (success) {
        ctx.reply(`استیکر ${type} با موفقیت ذخیره شد`);
    } else {
        ctx.reply('خطا در ذخیره استیکر');
    }
});

// دستور لیست استیکرها
bot.hears('لیست استیکرها', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    const stickerTypes = [
        { name: 'شروع', key: 'start' },
        { name: 'خوش آمدگویی', key: 'welcome' },
        { name: 'رد کاربر', key: 'reject' },
        { name: 'نفوذی', key: 'intruder' },
        { name: 'کشتن کاربر', key: 'kill' },
        { name: 'لیست مناطق', key: 'list_areas' },
        { name: 'بررسی مناطق', key: 'check_areas' },
        { name: 'بن کاربر', key: 'ban' }
    ];

    let message = 'لیست استیکرهای تنظیم شده:\n\n';
    
    stickerTypes.forEach(type => {
        const hasSticker = stickers.has(type.key);
        message += `${hasSticker ? '✅' : '❌'} ${type.name}\n`;
    });

    message += '\nبرای تنظیم استیکر از دستور /setsticker استفاده کنید';
    await ctx.reply(message);
});

// مدیریت دستور "شروع" - فقط برای مالک
bot.hears('شروع', async (ctx) => {
    if (ctx.from.id === OWNER_ID) {
        const message = await ctx.reply('نینجای چهار در خدمت شماست', {
            reply_to_message_id: ctx.message.message_id
        });
        
        await sendSticker(ctx, 'start');
        console.log('ربات توسط مالک فعال شد');
    }
});

// دستور بررسی مناطق
bot.hears('بررسی مناطق', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    await ctx.reply('در حال بررسی مناطق تحت حفاظت...');
    await sendSticker(ctx, 'check_areas');

    const allGroups = [GATEWAY_GROUP_ID, ...otherGroups];
    let successCount = 0;
    let failCount = 0;
    
    for (const groupId of allGroups) {
        try {
            await bot.telegram.sendMessage(groupId, 'این منطقه تحت نظارت منه');
            await sendSticker({ chat: { id: groupId } }, 'start');
            successCount++;
            console.log(`پیام به گروه ${groupId} ارسال شد`);
        } catch (error) {
            failCount++;
            console.error(`خطا در ارسال به گروه ${groupId}:`, error.message);
        }
    }

    await ctx.reply(`بررسی مناطق کامل شد\nموفق: ${successCount} | ناموفق: ${failCount}`);
});

// دستور لیست مناطق
bot.hears('لیست مناطق', async (ctx) => {
    if (ctx.chat.id !== GATEWAY_GROUP_ID && ctx.from.id !== OWNER_ID) return;

    let message = 'مناطق تحت حفاظت من:\n\n';
    message += `گروه دروازه (اصلی)\n`;

    otherGroups.forEach((groupId, index) => {
        const groupName = groupNames.get(groupId) || `منطقه ${index + 1}`;
        message += `${groupName} - آیدی: ${groupId}\n`;
    });

    message += `\nتعداد کل مناطق: ${otherGroups.length + 1}`;
    
    await ctx.reply(message);
    await sendSticker(ctx, 'list_areas');
});

// هندل کردن تمام رویدادهای عضویت
bot.on('chat_member', async (ctx) => {
    try {
        const chatMember = ctx.chatMember;
        const user = chatMember.new_chat_member.user;
        const chatId = chatMember.chat.id;
        const oldStatus = chatMember.old_chat_member.status;
        const newStatus = chatMember.new_chat_member.status;

        // نادیده گرفتن ربات‌ها
        if (user.is_bot) return;

        console.log(`رویداد عضویت: کاربر ${user.id} در گروه ${chatId} از ${oldStatus} به ${newStatus}`);

        // کاربر جدید به گروه دروازه پیوست
        if (chatId === GATEWAY_GROUP_ID && 
            (newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked' || oldStatus === 'restricted')) {
            
            await handleNewUserInGateway(user);
        }
        
        // کاربر از گروه دروازه خارج شد
        if (chatId === GATEWAY_GROUP_ID && 
            (newStatus === 'left' || newStatus === 'kicked') && 
            (oldStatus === 'member' || oldStatus === 'administrator')) {
            
            await handleUserLeftGateway(user);
        }
        
        // کاربر به گروه‌های دیگر پیوست
        if (otherGroups.includes(chatId) && 
            (newStatus === 'member' || newStatus === 'administrator') && 
            (oldStatus === 'left' || oldStatus === 'kicked' || oldStatus === 'restricted')) {
            
            await handleUserInOtherGroups(user, chatId);
        }
    } catch (error) {
        console.error('خطا در پردازش رویداد عضویت:', error);
    }
});

// مدیریت کاربر جدید در دروازه
async function handleNewUserInGateway(user) {
    // چک کن اگر کاربر مدیر است، نیاز به تایید ندارد
    if (user.id === OWNER_ID) {
        approvedUsers.add(user.id);
        return;
    }

    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const username = user.username ? '@' + user.username : 'بدون یوزرنیم';
    
    const messageText = `مسافر ${userName} وارد هال اکلیس شد\n\nارباب این شخص اجازه ورود به اکلیس رو داره؟`;
    
    // ذخیره کاربر در انتظار تایید
    pendingApprovals.set(user.id, {
        userName,
        username,
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
                        { text: 'بله، اجازه ورود داره', callback_data: `approve_${user.id}` },
                        { text: 'نه، اجازه ورود نداره', callback_data: `reject_${user.id}` }
                    ]
                ]
            }
        }
    );
    
    // ارسال پیام به گروه دروازه
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `مسافر ${userName} وارد هال شد...`
    );

    console.log(`کاربر ${user.id} در انتظار تایید`);
}

// مدیریت کلیک روی دکمه‌های تایید
bot.on('callback_query', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) {
        await ctx.answerCbQuery('فقط مالک می‌تواند این کار را انجام دهد');
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
});

// تایید کاربر
async function approveUser(userId, ctx) {
    const userData = pendingApprovals.get(userId);
    if (!userData) {
        await ctx.answerCbQuery('کاربر یافت نشد');
        return;
    }
    
    approvedUsers.add(userId);
    pendingApprovals.delete(userId);
    
    await ctx.answerCbQuery('کاربر تایید ش��');
    await ctx.editMessageText(`مسافر ${userData.userName} تایید شد`);
    
    // ارسال پیام خوش آمدگویی
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `مسافر ${userData.userName} به جهان بزرگ اکلیس خوش اومدی`
    );
    
    // ارسال استیکر خوش آمدگویی
    await sendSticker(ctx, 'welcome');
    
    console.log(`کاربر ${userId} تایید شد`);
}

// رد کاربر
async function rejectUser(userId, ctx) {
    const userData = pendingApprovals.get(userId);
    if (!userData) {
        await ctx.answerCbQuery('کاربر یافت نشد');
        return;
    }
    
    pendingApprovals.delete(userId);
    
    // بن کردن از گروه دروازه
    try {
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, userId);
        await ctx.answerCbQuery('کاربر بن شد');
        await ctx.editMessageText(`${userData.userName} از اکلیس بیرون رانده شد`);
        
        // ارسال استیکر رد
        await sendSticker(ctx, 'reject');
        
        console.log(`کاربر ${userId} بن شد`);
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

// مدیریت کاربر در گروه‌های دیگر
async function handleUserInOtherGroups(user, groupId) {
    // اگر کاربر مالک است، اجازه دسترسی دارد
    if (user.id === OWNER_ID) return;

    const isInGateway = await checkUserInGateway(user.id);
    const isApproved = approvedUsers.has(user.id);

    console.log(`بررسی کاربر ${user.id} در گروه ${groupId}: در دروازه=${isInGateway}, تایید شده=${isApproved}`);

    if (!isInGateway || !isApproved) {
        await banIntruder(user, groupId);
    }
}

// بن کردن نفوذی
async function banIntruder(user, groupId) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const username = user.username ? '@' + user.username : 'بدون یوزرنیم';
    const joinTime = new Date().toLocaleString('fa-IR');
    const groupName = groupNames.get(groupId) || `گروه ${groupId}`;
    
    try {
        // بن کردن از گروه
        await bot.telegram.banChatMember(groupId, user.id);
        
        // ارسال گزارش
        const report = `${userName}\n${user.id}\n${username}\n${joinTime}\n${groupName}\n\nاین نفوذی شناسایی و قبل از اینکه متوجه بشه کشته شد`;
        
        await bot.telegram.sendMessage(GATEWAY_GROUP_ID, report);
        
        // ارسال استیکر نفوذی
        await sendSticker({ chat: { id: GATEWAY_GROUP_ID } }, 'intruder');
        
        console.log(`نفوذی ${user.id} در گروه ${groupId} شناسایی و بن شد`);
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
    const banPromises = otherGroups.map(groupId => {
        return bot.telegram.banChatMember(groupId, user.id).catch(error => {
            // ممکن است کاربر در گروه نباشد - این خطا را نادیده بگیر
            if (!error.message.includes('USER_NOT_PARTICIPANT')) {
                console.error(`خطا در بن کردن از گروه ${groupId}:`, error.message);
            }
        });
    });

    await Promise.all(banPromises);
    
    console.log(`کاربر ${user.id} از تمام گروه‌ها حذف شد`);
}

// مدیریت پیام‌های کاربران تأیید نشده در دروازه
bot.on('message', async (ctx) => {
    try {
        // فقط در گروه دروازه بررسی کن
        if (ctx.chat.id !== GATEWAY_GROUP_ID) return;
        
        const userId = ctx.from.id;
        
        // اگر کاربر مالک است یا تأیید شده است، اجازه بده
        if (userId === OWNER_ID || approvedUsers.has(userId)) return;
        
        // اگر کاربر در انتظار تأیید است، پیامش را پاک کن
        if (pendingApprovals.has(userId)) {
            const userData = pendingApprovals.get(userId);
            
            // پاک کردن پیام کاربر
            try {
                await ctx.deleteMessage();
            } catch (error) {
                console.error('خطا در پاک کردن پیام:', error);
            }
            
            // ارسال اخطار
            const warningMessage = await ctx.reply(
                `مسافر ${userData.userName} شما اجازه هیچ فعالیتی را ندارید ، مگر  توسط ارباب من تایید بشی`,
                { reply_to_message_id: ctx.message.message_id }
            );
            
            // پاک کردن پیام اخطار بعد از 5 ثانیه
            setTimeout(async () => {
                try {
                    await bot.telegram.deleteMessage(ctx.chat.id, warningMessage.message_id);
                } catch (error) {
                    // نادیده گرفتن خطا در پاک کردن
                }
            }, 5000);
        }
        
        // هندل کردن دستور بن
        await handleBanCommand(ctx);
    } catch (error) {
        console.error('خطا در مدیریت پیام:', error);
    }
});

// هندل کردن دستور بن
async function handleBanCommand(ctx) {
    if (ctx.from.id !== OWNER_ID) return;
    
    const message = ctx.message.text;
    
    // بن با ریپلای
    if (message && message.includes('بن') && ctx.message.reply_to_message) {
        const targetUser = ctx.message.reply_to_message.from;
        
        // اگر کاربر مدیر است، بن نکن
        if (targetUser.id === OWNER_ID) {
            return ctx.reply('نمیتوانید مالک را بن کنید');
        }
        
        await banUserFromAllGroups(targetUser, ctx);
        return;
    }
    
    // بن با منشن
    if (message && message.startsWith('بن @')) {
        const username = message.split(' ')[0].replace('بن @', '').trim();
        await banUserByUsername(username, ctx);
        return;
    }
}

// بن کردن کاربر با یوزرنیم
async function banUserByUsername(username, ctx) {
    try {
        // این یک پیاده‌سازی ساده است - در عمل نیاز به روش پیچیده‌تری دارید
        await ctx.reply(`در جستجوی کاربر @${username}...`);
        
        // در اینجا باید کاربر را با یوزرنیم پیدا کنید
        // فعلاً پیام می‌دهیم که از ریپلای استفاده شود
        await ctx.reply('برای بن کردن با یوزرنیم، لطفاً از ریپلای روی پیام کاربر استفاده کنید.\n\nروی پیام کاربر ریپلای کنید و بنویسید: "بن"');
        
    } catch (error) {
        console.error('خطا در بن کردن با یوزرنیم:', error);
        await ctx.reply('خطا در بن کردن کاربر');
    }
}

// بن کردن کاربر از تمام گروه‌ها
async function banUserFromAllGroups(user, ctx) {
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    
    try {
        // بن کردن از گروه دروازه
        await bot.telegram.banChatMember(GATEWAY_GROUP_ID, user.id);
        
        // بن کردن از تمام گروه‌های دیگر
        const banPromises = otherGroups.map(groupId => {
            return bot.telegram.banChatMember(groupId, user.id).catch(error => {
                if (!error.message.includes('USER_NOT_PARTICIPANT')) {
                    console.error(`خطا در بن کردن از گروه ${groupId}:`, error.message);
                }
            });
        });

        await Promise.all(banPromises);
        
        approvedUsers.delete(user.id);
        pendingApprovals.delete(user.id);
        
        // ارسال پیام تأیید با ریپلای
        const replyMessage = await ctx.reply(`${userName} با موفقیت کشته شد...`, {
            reply_to_message_id: ctx.message.message_id
        });
        
        // ارسال استیکر
        await sendSticker(ctx, 'kill');
        
        console.log(`کاربر ${user.id} از تمام گروه‌ها بن شد`);
    } catch (error) {
        await ctx.reply('خطا در بن کردن کاربر');
        console.error('خطا در بن کردن کاربر:', error);
    }
}

// تابع برای هندل کردن بن دسته‌جمعی
async function handleMassIntrusion(users, groupId) {
    console.log(`شروع بن ${users.length} کاربر در گروه ${groupId}`);
    
    const groupName = groupNames.get(groupId) || `گروه ${groupId}`;
    const joinTime = new Date().toLocaleString('fa-IR');
    
    // بن کردن همه کاربران به صورت همزمان
    const banPromises = users.map(async (user) => {
        try {
            await bot.telegram.banChatMember(groupId, user.id);
            
            // ارسال گزارش برای هر کاربر
            const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            const username = user.username ? '@' + user.username : 'بدون یوزرنیم';
            
            const report = `${userName}\n${user.id}\n${username}\n${joinTime}\n${groupName}\n\nاین نفوذی شناسایی و قبل از اینکه متوجه بشه کشته شد`;
            
            await bot.telegram.sendMessage(GATEWAY_GROUP_ID, report);
            
            return { success: true, user: user.id };
        } catch (error) {
            console.error(`خطا در بن کردن کاربر ${user.id}:`, error.message);
            return { success: false, user: user.id, error: error.message };
        }
    });

    const results = await Promise.all(banPromises);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // ارسال استیکر نهایی
    await sendSticker({ chat: { id: GATEWAY_GROUP_ID } }, 'intruder');
    
    // ارسال گزارش نهایی
    await bot.telegram.sendMessage(
        GATEWAY_GROUP_ID,
        `عملیات بن دسته‌جمعی کامل شد\nموفق: ${successCount} | ناموفق: ${failCount}`
    );
    
    console.log(`بن دسته‌جمعی کامل شد: ${successCount} موفق, ${failCount} ناموفق`);
}

// راه‌اندازی ربات
async function startBot() {
    try {
        // بارگذاری استیکرها از دیتابیس
        await loadStickers();
        
        await bot.launch();
        console.log('ربات نینجای چهار راه‌اندازی شد');
        console.log('منتظر فعالیت...');
        console.log(`مالک: ${OWNER_ID}`);
        console.log(`گروه دروازه: ${GATEWAY_GROUP_ID}`);
        console.log(`تعداد گروه‌های تحت حفاظت: ${otherGroups.length}`);
        
        // ارسال پیام شروع به مالک
        await bot.telegram.sendMessage(OWNER_ID, 'ربات نینجای چهار فعال شد و آماده خدمت‌رسانی است');
        
    } catch (error) {
        console.error('خطا در راه‌اندازی ربات:', error);
    }
}

// مدیریت خاموشی
process.once('SIGINT', () => {
    console.log('ربات در حال خاموش شدن...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('ربات در حال خاموش شدن...');
    bot.stop('SIGTERM');
});

// شروع ربات
startBot();
