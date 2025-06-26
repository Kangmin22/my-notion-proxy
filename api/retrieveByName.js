// api/retrieveByName.js
import { createClient } from '@vercel/kv';

// Vercel KV 또는 Upstash 연결 정보를 자동으로 가져옵니다.
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
  try {
    // 1. GPT로부터 프롬프트 이름을 받습니다.
    const promptName = request.body.prompt_name;
    const databaseId = "21d33048babe80d09d09e923f6e99c54"; // 데이터베이스 ID는 고정

    if (!promptName) {
      return response.status(400).json({ error: 'Proxy Error: prompt_name is missing.' });
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    // --- 캐싱 로직 시작 ---
    const cacheKey = `prompt_name:${promptName}`; // 캐시에 저장할 고유 키 생성
    let pageId = await kv.get(cacheKey);

    // 2. 캐시에 pageId가 있는지 확인합니다.
    if (pageId) {
      // (Cache Hit) 캐시에 ID가 있으면 바로 4단계로 넘어갑니다.
      console.log(`Cache HIT for ${promptName}. Using Page ID: ${pageId}`);
    } else {
      // (Cache Miss) 캐시에 ID가 없으면 노션에서 조회합니다.
      console.log(`Cache MISS for ${promptName}. Querying Notion...`);
      const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
      const queryBody = {
        filter: {
          property: "Prompt Name",
          title: {
            equals: promptName,
          },
        },
      };

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

      if (queryData.results.length === 0) {
        return response.status(404).json({ error: `Prompt with name '${promptName}' not found.` });
      }

      if (queryData.results.length > 1) {
        // 중복된 결과는 캐시하지 않고, 사용자에게 선택지를 제공합니다.
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
      
      // 3. 결과가 하나일 때, pageId를 찾아서 캐시에 저장합니다 (유효기간 1시간).
      pageId = queryData.results[0].id;
      await kv.set(cacheKey, pageId, { ex: 3600 });
      console.log(`Cached new Page ID: ${pageId} for ${promptName}.`);
    }
    // --- 캐싱 로직 끝 ---

    // 4. pageId를 가지고 본문 내용을 조회합니다.
    const retrieveUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
    const retrieveResponse = await fetch(retrieveUrl, {
      method: 'GET',
      headers: notionHeaders,
    });

    if (!retrieveResponse.ok) {
      const errorData = await retrieveResponse.json();
      throw new Error(`Notion Retrieve API Error: ${retrieveResponse.status} ${JSON.stringify(errorData)}`);
    }

    const retrieveData = await retrieveResponse.json();
    response.status(200).json(retrieveData);

  } catch (error) {
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
