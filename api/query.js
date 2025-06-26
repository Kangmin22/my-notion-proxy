// api/query.js
const { createClient } = require('@vercel/kv');

// Vercel KV 또는 Upstash 연결 정보를 자동으로 가져옵니다.
const kv = createClient({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

module.exports = async (request, response) => {
    console.log("Cache-First Query started.");
    
    // KV 클라이언트가 올바르게 초기화되었는지 확인
    if (!process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL) {
        console.error("KV environment variables are not set.");
        return response.status(500).json({ error: "KV store connection details are not configured." });
    }

    try {
        // kv.get()은 이제 자동으로 객체/배열을 반환합니다.
        const modules = await kv.get('notion_modules_cache');
        
        if (!modules) {
            return response.status(404).json({ 
                error: "Cache is empty.",
                recommendation: "Please run the sync process first by calling the /api/syncNotion endpoint."
            });
        }

        // JSON.parse가 더 이상 필요 없습니다. 'modules'는 이미 자바스크립트 배열입니다.
        let filteredModules = modules;
        const { filter, sorts } = request.body;

        // 서버 사이드에서 필터링 로직 수행
        if (filter) {
            // 예시: Tags 속성으로 필터링
            if (filter.property === 'Tags' && filter.multi_select?.contains) {
                const filterTag = filter.multi_select.contains;
                filteredModules = modules.filter(m => m.tags && m.tags.includes(filterTag));
            }
            // 예시: Prompt Name으로 필터링
            if (filter.property === 'Prompt Name' && filter.title?.equals) {
                const filterName = filter.title.equals;
                filteredModules = modules.filter(m => m.name === filterName);
            }
        }
        
        // 서버 사이드에서 정렬 로직 수행 (추후 확장 가능)
        if (sorts && sorts.length > 0) {
            // 예시: 마지막 수정 시간(last_edited_time)으로 정렬
            const sortRule = sorts[0];
            if (sortRule.property === 'last_edited_time') {
                filteredModules.sort((a, b) => {
                    const dateA = new Date(a.last_edited_time);
                    const dateB = new Date(b.last_edited_time);
                    return sortRule.direction === 'ascending' ? dateA - dateB : dateB - dateA;
                });
            }
        }
        
        const lastSynced = await kv.get('last_synced_at');

        response.status(200).json({ 
            message: `Query successful from cache. Found ${filteredModules.length} modules.`,
            last_synced: lastSynced,
            results: filteredModules
        });

    } catch (error) {
        console.error("Cache Query Error:", error);
        response.status(500).json({ error: 'Failed to query cache.', details: error.message });
    }
};
