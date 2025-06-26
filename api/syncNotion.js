// api/syncNotion.js
const { createClient } = require('@vercel/kv');

// Vercel에 설정된 환경 변수를 직접 사용합니다.
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Notion API에서 페이지네이션을 통해 모든 페이지를 가져오는 헬퍼 함수
async function getAllPages(notionHeaders, databaseId) {
    const allResults = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
        const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
        // Body를 비워두면 필터 없이 모든 페이지를 가져옵니다.
        const body = {
            start_cursor: nextCursor
        };
        
        const response = await fetch(queryUrl, {
            method: 'POST',
            headers: notionHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Notion Query API Error: ${response.status} ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        allResults.push(...data.results);
        hasMore = data.has_more;
        nextCursor = data.next_cursor;
    }
    return allResults;
}

module.exports = async (request, response) => {
    console.log("Sync Engine started by Vercel Cron or manual trigger.");
    
    // KV 클라이언트가 올바르게 초기화되었는지 확인
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.error("KV environment variables are not set.");
        return response.status(500).json({ error: "KV store connection details are not configured in Vercel environment variables." });
    }

    try {
        const databaseId = "21d33048babe80d09d09e923f6e99c54";
        
        // Cron Job으로 실행될 때를 대비해, 서버에 저장된 노션 토큰을 사용합니다.
        // Vercel 환경 변수에 NOTION_API_KEY 라는 이름으로 당신의 토큰을 저장해야 합니다.
        const notionToken = process.env.NOTION_API_KEY;
        if (!notionToken) {
            throw new Error("NOTION_API_KEY is not set in Vercel environment variables.");
        }

        const notionHeaders = {
            'Authorization': `Bearer ${notionToken}`,
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
                goal: page.properties["Goal"]?.rich_text[0]?.plain_text || null,
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
