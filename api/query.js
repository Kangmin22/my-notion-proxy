// api/query.js
const { createClient } = require('@vercel/kv');

let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

module.exports = async (request, response) => {
    console.log("Cache-First Query started.");
    if (!kv) {
        return response.status(500).json({ error: "KV store is not configured." });
    }

    try {
        const cachedData = await kv.get('notion_modules_cache');
        if (!cachedData) {
            return response.status(404).json({ error: "Cache is empty. Please run the sync process first." });
        }

        let modules = JSON.parse(cachedData);
        const { filter, sorts } = request.body;

        // 서버 사이드에서 필터링 및 정렬 로직 (MVP에서는 생략, 추후 확장 가능)
        if (filter) {
            // 예시: tags로 필터링
            if (filter.property === 'Tags' && filter.multi_select?.contains) {
                modules = modules.filter(m => m.tags.includes(filter.multi_select.contains));
            }
        }

        // ... sorts 로직 추가 가능 ...
        
        const lastSynced = await kv.get('last_synced_at');

        response.status(200).json({ 
            message: `Query successful from cache.`,
            last_synced: lastSynced,
            results: modules
        });

    } catch (error) {
        console.error("Cache Query Error:", error);
        response.status(500).json({ error: 'Failed to query cache.', details: error.message });
    }
};
