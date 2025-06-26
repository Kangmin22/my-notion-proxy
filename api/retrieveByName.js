// api/retrieveByName.js
import { createClient } from '@vercel/kv';

let kv;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  kv = createClient({ /*...*/ });
}

export default async function handler(request, response) {
  try {
    const promptName = request.body.prompt_name;
    const databaseId = "21d33048babe80d09d09e923f6e99c54";

    if (!promptName) { /* ... */ }

    const { headers } = request;
    const notionHeaders = { /* ... */ };

    let pageId;
    const cacheKey = `prompt_name:${promptName}`;
    if (kv) pageId = await kv.get(cacheKey);

    if (!pageId) {
      // ... 캐시 미스 시 노션 DB 쿼리 로직 (이전과 동일) ...
      const queryData = await queryResponse.json();
      // ... 404, 중복 결과 처리 로직 (이전과 동일) ...
      pageId = queryData.results[0].id;
      if (kv) await kv.set(cacheKey, pageId, { ex: 3600 });
    }

    // --- 핵심 로직 변경: 페이지 ID로 본문의 '첫 페이지만' 조회 ---
    const retrieveUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
    const retrieveResponse = await fetch(retrieveUrl, { method: 'GET', headers: notionHeaders });

    if (!retrieveResponse.ok) { /* ... 에러 처리 ... */ }

    const retrieveData = await retrieveResponse.json();
    
    // GPT가 다음 페이지를 요청할 수 있도록, 페이지 ID를 응답에 추가해줌
    retrieveData.page_id_for_pagination = pageId; 
    
    response.status(200).json(retrieveData);

  } catch (error) { /* ... */ }
}
