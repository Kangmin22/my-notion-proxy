// api/syncNotion.js
const { createClient } = require('@vercel/kv');

let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

// Notion API에서 페이지네이션을 통해 모든 페이지를 가져오는 헬퍼 함수
async function getAllPages(notionHeaders, databaseId) {
    const allResults = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
        const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
        const body = {
            start_cursor: nextCursor
        };
        const response = await fetch(queryUrl, {
            method: 'POST',
            headers: notionHeaders,
            body: JSON.stringify(body),
        });
        const data = await response.json();
        allResults.push(...data.results);
        hasMore = data.has_more;
        nextCursor = data.next_cursor;
    }
    return allResults;
}

module.exports = async (request, response) => {
    console.log("Sync Engine started by Vercel Cron.");
    if (!kv) {
        return response.status(500).json({ error: "KV store is not configured." });
    }

    try {
        const databaseId = "21d33048babe80d09d09e923f6e99c54";
        const notionHeaders = {
            'Authorization': `Bearer ${process.env.NOTION_API_KEY}`, // Cron Job은 사용자의 토큰을 모르므로, 서버에 저장된 토큰을 사용해야 합니다.
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
        };

        const allPages = await getAllPages(notionHeaders, databaseId);

        // KV에 저장하기 위해 핵심 데이터만 추출
        const modulesCache = allPages.map(page => {
            return {
                page_id: page.id,
                last_edited_time: page.last_edited_time,
                name: page.properties["Prompt Name"]?.title[0]?.plain_text || null,
                status: page.properties["Status"]?.status?.name || null,
                tags: page.properties["Tags"]?.multi_select.map(t => t.name) || [],
                version: page.properties["Version"]?.number || null,
            };
        });

        // 추출된 데이터를 KV에 통째로 저장
        await kv.set('notion_modules_cache', JSON.stringify(modulesCache));
        await kv.set('last_synced_at', new Date().toISOString());

        const message = `Sync completed. ${modulesCache.length} modules have been cached.`;
        console.log(message);
        response.status(200).json({ message: message });

    } catch (error) {
        console.error("Sync Engine Error:", error);
        response.status(500).json({ error: 'Sync failed.', details: error.message });
    }
};
