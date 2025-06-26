// api/query.js
export default async function handler(request, response) {
  try {
    const databaseId = request.body.database_id;
    if (!databaseId) {
      return response.status(400).json({ error: 'Proxy Error: Database ID is missing from the request body.' });
    }

    const notionApiUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;

    const { headers, body } = request;

    // 노션으로 보낼 요청 본문을 초기화합니다.
    const notionRequestBody = {};

    // GPT가 filter 조건을 보낸 경우에만 request body에 추가합니다. (안정성 강화)
    if (body.filter && Object.keys(body.filter).length > 0) {
      notionRequestBody.filter = body.filter;
    }

    // GPT가 sorts 조건을 보낸 경우에만 request body에 추가합니다. (안정성 강화)
    if (body.sorts && body.sorts.length > 0) {
      notionRequestBody.sorts = body.sorts;
    }

    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    const notionResponse = await fetch(notionApiUrl, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify(notionRequestBody),
    });

    // 노션 응답이 정상이 아닐 경우, 그 내용을 바로 에러로 던져서 catch 블록에서 잡도록 합니다. (안정성 강화)
    if (!notionResponse.ok) {
      const errorData = await notionResponse.json();
      throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await notionResponse.json();
    response.status(200).json(data);

  } catch (error) {
    // 이제 Vercel 로그에 훨씬 더 상세한 에러가 기록됩니다.
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
