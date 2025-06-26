// api/syncNotion.js
// Vercel KV (Upstash Redis) 클라이언트를 불러옵니다.
const { createClient } = require('@vercel/kv');
// Notion API 클라이언트를 불러옵니다. (npm install @notionhq/client 필요)
const { Client } = require('@notionhq/client');

// Vercel KV 클라이언트 초기화:
// Vercel 프로젝트 환경 변수 (KV_REST_API_URL, KV_REST_API_TOKEN)를 사용하여 클라이언트를 생성합니다.
// 이 변수들은 Vercel 대시보드 -> 프로젝트 설정 -> Environment Variables에 설정되어야 합니다.
const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

// Notion API 클라이언트 초기화:
// NOTION_API_KEY 환경 변수를 사용하여 Notion 클라이언트를 생성합니다.
// 이 변수도 Vercel 대시보드에 설정해야 합니다.
const notion = new Client({ auth: process.env.NOTION_API_KEY });


/**
 * Notion 데이터베이스에서 모든 페이지를 가져오는 함수.
 * Notion API의 페이지네이션을 처리하여 모든 결과를 반환합니다.
 * @param {string} databaseId - Notion 데이터베이스 ID.
 * @returns {Promise<Array>} - Notion 페이지 객체 배열.
 */
async function getAllPages(databaseId) {
    let allPages = [];
    let hasMore = true;
    let cursor = undefined;

    try {
        while (hasMore) {
            const response = await notion.databases.query({
                database_id: databaseId,
                start_cursor: cursor,
            });

            allPages = allPages.concat(response.results);
            hasMore = response.has_more;
            cursor = response.next_cursor;
        }
        return allPages;
    } catch (error) {
        console.error("Error fetching Notion pages:", error);
        // Notion API 호출 실패 시 오류를 다시 던져서 상위 함수에서 처리하도록 합니다.
        throw new Error(`Failed to fetch Notion pages: ${error.message}`);
    }
}

// Vercel 서버리스 함수의 메인 핸들러
module.exports = async (request, response) => {
    console.log("Sync Engine started.");

    // KV 클라이언트 및 Notion API 키 환경 변수 존재 여부 확인
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        console.error("Server configuration error: Vercel KV environment variables (KV_REST_API_URL, KV_REST_API_TOKEN) are missing.");
        return response.status(500).json({ error: "Server configuration error: KV environment variables missing." });
    }
    if (!process.env.NOTION_API_KEY) {
        console.error("Server configuration error: Notion API Key environment variable (NOTION_API_KEY) is missing.");
        return response.status(500).json({ error: "Server configuration error: Notion API Key missing." });
    }

    try {
        const databaseId = "21d33048babe80d09d09e923f6e99c54";

        // getAllPages 함수에 데이터베이스 ID만 전달합니다.
        // Notion 클라이언트가 이미 인증 정보를 가지고 있습니다.
        const allPages = await getAllPages(databaseId);

        // Notion 페이지 데이터를 캐싱 가능한 형태로 변환합니다.
        const modulesCache = allPages.map(page => ({
            page_id: page.id,
            last_edited_time: page.last_edited_time,
            // Notion 속성 이름과 타입에 맞게 접근 방식을 조정하세요.
            // 예를 들어, title 속성은 배열 형태이므로 첫 번째 요소를 가져옵니다.
            name: page.properties["Prompt Name"]?.title?.[0]?.plain_text || null,
            status: page.properties["Status"]?.status?.name || null,
            tags: page.properties["Tags"]?.multi_select?.map(t => t.name) || [],
            version: page.properties["Version"]?.number || null,
            goal: page.properties["Goal"]?.rich_text?.[0]?.plain_text || null,
        }));

        // Vercel KV에 변환된 데이터를 저장합니다.
        // @vercel/kv는 자동으로 JavaScript 객체를 JSON으로 직렬화합니다.
        await kv.set('notion_modules_cache', modulesCache);
        await kv.set('last_synced_at', new Date().toISOString());

        const message = `Sync completed. ${modulesCache.length} modules have been cached.`;
        console.log(message);
        response.status(200).json({ message: message });

    } catch (error) {
        // 동기화 과정 중 발생한 오류를 기록하고 클라이언트에 오류 응답을 보냅니다.
        console.error("Sync Engine failed:", error);
        response.status(500).json({ error: "Failed to sync Notion data.", details: error.message });
    }
};
