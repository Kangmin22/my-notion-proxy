// api/_lib/airtable.js
const Airtable = require('airtable');
const { createClient } = require('@vercel/kv');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;
const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function getRecordByName(promptName) {
    const cacheKey = `prompt_name:${promptName}`;
    const cachedRecord = await kv.get(cacheKey);
    if (cachedRecord) {
        console.log(`Cache HIT for ${promptName}.`);
        return cachedRecord;
    }

    console.log(`Cache MISS for ${promptName}. Fetching all records from Airtable...`);
    
    // Airtable의 모든 레코드를 가져옵니다.
    const allRecords = await base(tableName).select().all();
    
    // 코드 안에서 직접 이름을 비교하여 레코드를 찾습니다.
    const foundRecord = allRecords.find(record => record.get('Prompt Name') === promptName);

    if (!foundRecord) {
        throw new Error(`Prompt '${promptName}' not found in Airtable.`);
    }
    
    const result = { id: foundRecord.getId(), yaml_script: foundRecord.get('YAML Script') };
    
    await kv.set(cacheKey, result, { ex: 3600 });
    return result;
}

module.exports = { getRecordByName, base, tableName };
