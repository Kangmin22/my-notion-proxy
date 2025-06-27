// api/syncAirtable.js
const { createClient } = require('@vercel/kv');
const Airtable = require('airtable');

// ✅ 수정된 부분: UPSTASH 환경 변수 사용
const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

module.exports = async (request, response) => {
    console.log("Airtable Sync Engine started.");

    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_TABLE_NAME) {
        console.error("Server configuration error: Airtable environment variables are missing.");
        return response.status(500).json({ error: "Server configuration error: Airtable environment variables missing." });
    }

    try {
        const allRecords = await base(tableName).select().all();

        const modulesCache = allRecords.map(record => ({
            page_id: record.getId(),
            last_edited_time: record.get('Last Edited Time'),
            name: record.get('Prompt Name') || null,
            status: record.get('Status') || null,
            tags: record.get('Tags') || [],
            version: record.get('Version') || null,
            goal: record.get('Goal') || null,
        }));

        await kv.set('notion_modules_cache', modulesCache);
        await kv.set('last_synced_at', new Date().toISOString());

        const message = `Sync completed. ${modulesCache.length} modules from Airtable have been cached.`;
        console.log(message);
        response.status(200).json({ message });

    } catch (error) {
        console.error("Airtable Sync Engine failed:", error);
        response.status(500).json({ error: "Failed to sync Airtable data.", details: error.message });
    }
};
