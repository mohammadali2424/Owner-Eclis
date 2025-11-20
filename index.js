// ارسال همه پیام‌ها به گروه
async function sendAllMessages(chatId) {
    if (messageQueue.length === 0) {
        await bot.sendMessage(chatId, '❌ هیچ پیامی برای ارسال ندارید!');
        return;
    }

    try {
        let successCount = 0;
        
        for (const item of messageQueue) {
            try {
                switch (item.type) {
                    case 'text':
                        // استفاده از HTML برای فرمت‌بندی و غیرفعال کردن پیش‌نمایش
                        await bot.sendMessage(TARGET_GROUP_ID, item.content, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        break;
                    case 'photo':
                        await bot.sendPhoto(TARGET_GROUP_ID, item.file_id, {
                            caption: item.caption,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        });
                        break;
                    case 'video':
                        await bot.sendVideo(TARGET_GROUP_ID, item.file_id, {
                            caption: item.caption,
                            parse_mode: 'HTML', 
                            disable_web_page_preview: true
                        });
                        break;
                    // بقیه case ها مانند قبل...
                }
                successCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`خطا در ارسال آیتم:`, error.message);
            }
        }

        await bot.sendMessage(chatId, 
            `✅ ارسال کامل شد!\n` +
            `📤 ${successCount} از ${messageQueue.length} پیام با موفقیت ارسال شد`
        );
        
        messageQueue = [];
        
    } catch (error) {
        console.error('خطا در ارسال:', error);
        await bot.sendMessage(chatId, '❌ خطا در ارسال پیام‌ها!');
    }
}
