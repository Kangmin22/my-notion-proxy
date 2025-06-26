// api/syncNotion.js
const { createClient } = require('@vercel/kv');

const kv = createClient({ /* ... 이전과 동일 ... */ });
async function getAllPages(notionHeaders, databaseId) { /* ... 이전과 동일 ... */ }

module.exports = async (request, response) => {
    console.log("Sync Engine started.");
    if (!kv) { /* ... */ }

    try {
        const databaseId = "21d33048babe80d09d09e923f6e99c54";
        const notionHeaders = { /* ... */ };

        const allPages = await getAllPages(notionHeaders, databaseId);

        const modulesCache = allPages.map(page => ({
            page_id: page.id,
            last_edited_time: page.last_edited_time,
            name: page.properties["Prompt Name"]?.title[0]?.plain_text || null,
            status: page.properties["Status"]?.status?.name || null,
            tags: page.properties["Tags"]?.multi_select.map(t => t.name) || [],
            version: page.properties["Version"]?.number || null,
            goal: page.properties["Goal"]?.rich_text[0]?.plain_text || null,
        }));

        // --- 핵심 수정 ---
        // JSON.stringify를 제거하고, 자바스크립트 객체를 직접 저장합니다.
        await kv.set('notion_modules_cache', modulesCache); 
        await kv.set('last_synced_at', new Date().toISOString());

        const message = `Sync completed. ${modulesCache.length} modules have been cached.`;
        console.log(message);
        response.status(200).json({ message: message });

    } catch (error) { /* ... */ }
};
