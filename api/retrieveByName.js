// api/retrieveByName.js
const { createClient } = require('@vercel/kv');

let kv;
// Vercel 환경 변수가 있을 때만 KV 클라이언트를 생성합니다.
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

module.exports = async (request, response) => {
  console.log("Function 'retrieveByName' started.");
  try {
    const promptName = request.body.prompt_name;
    const databaseId = "21d33048babe80d09d09e923f6e99c54";

    if (!promptName) {
      return response.status(400).json({ error: 'Proxy Error: prompt_name is missing.' });
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };
    
    let pageId;
    const cacheKey = `prompt_name:${promptName}`;

    if (kv) {
      console.log(`Checking cache with key: ${cacheKey}`);
      pageId = await kv.get(cacheKey);
    } else {
      console.log("KV client not initialized. Skipping cache.");
    }

    if (pageId) {
      console.log(`Cache HIT for ${promptName}. Using Page ID: ${pageId}`);
    } else {
      console.log(`Cache MISS for ${promptName}. Querying Notion API...`);
      const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
      const queryBody = { filter: { property: "Prompt Name", title: { equals: promptName } } };
      
      const queryResponse = await fetch(queryUrl, {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify(queryBody),
      });

      if (!queryResponse.ok) {
          const errorData = await queryResponse.json();
          throw new Error(`Notion Query API Error: ${queryResponse.status} ${JSON.stringify(errorData)}`);
      }

      const queryData = await queryResponse.json();
      console.log(`Notion query returned ${queryData.results.length} results.`);

      if (queryData.results.length === 0) {
        return response.status(404).json({ error: `Prompt with name '${promptName}' not found.` });
      }

      if (queryData.results.length > 1) {
        const multipleResults = queryData.results.map(page => ({
          page_id: page.id,
          prompt_name: page.properties["Prompt Name"].title[0]?.plain_text || 'Untitled',
          version: page.properties["Version"]?.number || null,
          status: page.properties["Status"]?.status?.name || 'No Status'
        }));
        return response.status(200).json({ 
          type: "multiple_choices", 
          message: "Multiple prompts found. Please select one.",
          choices: multipleResults 
        });
      }
      
      page
