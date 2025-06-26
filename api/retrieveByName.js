// api/retrieveByName.js
import { createClient } from '@vercel/kv';

let kv;
// Vercel 환경 변수가 있을 때만 KV 클라이언트를 생성합니다.
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

export default async function handler(request, response) {
  console.log("Function 'retrieveByName' started."); // 1. 함수 시작 로그

  try {
    const promptName = request.body.prompt_name;
    const databaseId = "21d33048babe80d09d09e923f6e99c54";

    if (!promptName) {
      console.error("Error: prompt_name is missing.");
      return response.status(400).json({ error: 'Proxy Error: prompt_name is missing.' });
    }
    console.log(`Received request for prompt_name: ${promptName}`); // 2. 입력 값 로그

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    let pageId;
    const cacheKey = `prompt_name:${promptName}`;

    if (kv) {
      console.log(`Checking cache with key: ${cacheKey}`); // 3. 캐시 확인 로그
      pageId = await kv.get(cacheKey);
    } else {
      console.log("KV client not initialized. Skipping cache."); // KV 연결 안됐을 때 로그
    }

    if (pageId) {
      console.log(`Cache HIT. Found Page ID: ${pageId}`); // 4. 캐시 성공 로그
    } else {
      console.log("Cache MISS. Querying Notion API..."); // 5. 캐시 실패 로그
      
      const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
      const queryBody = { filter: { property: "Prompt Name", title: { equals: promptName } } };
      
      const queryResponse = await fetch(queryUrl, { method: 'POST', headers: notionHeaders, body: JSON.stringify(queryBody) });

      if (!queryResponse.ok) {
        const errorData = await queryResponse.json();
        throw new Error(`Notion Query API Error: ${queryResponse.status} ${JSON.stringify(errorData)}`);
      }

      const queryData = await queryResponse.json();
      console.log(`Notion query returned ${queryData.results.length} results.`); // 6. 노션 쿼리 결과 로그

      if (queryData.results.length === 0) {
        return response.status(404).json({ error: `Prompt with name '${promptName}' not found.` });
      }

      if (queryData.results.length > 1) {
        const multipleResults = queryData.results.map(p => ({ /* ... */ }));
        return response.status(200).json({ type: "multiple_choices", choices: multipleResults });
      }
      
      pageId = queryData.results[0].id;
      if (kv) {
        await kv.set(cacheKey, pageId, { ex: 3600 });
        console.log(`Cached new Page ID: ${pageId} for ${promptName}.`); // 7. 캐시 저장 로그
      }
    }

    console.log(`Retrieving blocks for Page ID: ${pageId}`); // 8. 본문 조회 시작 로그
    const retrieveUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
    const retrieveResponse = await fetch(retrieveUrl, { method: 'GET', headers: notionHeaders });

    if (!retrieveResponse.ok) {
        const errorData = await retrieveResponse.json();
        throw new Error(`Notion Retrieve API Error: ${retrieveResponse.status} ${JSON.stringify(errorData)}`);
    }

    const retrieveData = await retrieveResponse.json();
    console.log("Successfully retrieved blocks. Sending response."); // 9. 최종 성공 로그
    response.status(200).json(retrieveData);

  } catch (error) {
    console.error('CRITICAL ERROR in retrieveByName:', error); // 10. 전체 에러 로그
    response.status(500).json({ error: 'Proxy server encountered a critical error.', details: error.message });
  }
}
