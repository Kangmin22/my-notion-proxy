// api/query.js
const { createClient } = require('@vercel/kv');

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (request, response) => {
    console.log("Cache-First Query started.");
    
    if (!kv) {
        console.error("KV client is not initialized.");
        return response.status(500).json({ error: "KV store connection details are not configured." });
    }

    try {
        const modules = await kv.get('notion_modules_cache');
        
        if (!modules) {
            return response.status(404).json({ 
                error: "Cache is empty.",
                recommendation: "Please run the sync process first by calling the /api/syncAirtable endpoint."
            });
        }
        
        let filteredModules = modules;
        const { filter } = request.body;

        if (filter) {
            if (filter.property === 'Tags' && filter.multi_select?.contains) {
                const filterTag = filter.multi_select.contains;
                filteredModules = modules.filter(m => m.tags && m.tags.includes(filterTag));
            }
            if (filter.property === 'Prompt Name' && filter.title?.equals) {
                const filterName = filter.title.equals;
                filteredModules = modules.filter(m => m.name === filterName);
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
