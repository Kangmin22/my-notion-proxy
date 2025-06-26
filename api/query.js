// api/query.js
export default async function handler(request, response) {
  // 노션 데이터베이스 쿼리 엔드포인트
  const notionApiUrl = `https://api.notion.com/v1/databases/${request.body.database_id}/query`;

  try {
    const { method, headers, body } = request;

    // GPT가 보낸 필터 조건을 그대로 사용합니다.
    const notionRequestBody = {
      filter: body.filter,
      sorts: body.sorts,
    };

    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };

    // 노션 API로 쿼리 요청을 보냅니다.
    const notionResponse = await fetch(notionApiUrl, {
      method: 'POST', // 쿼리는 항상 POST 방식입니다.
      headers: notionHeaders,
      body: JSON.stringify(notionRequestBody),
    });

    const data = await notionResponse.json();
    response.status(notionResponse.status).json(data);

  } catch (error) {
    response.status(500).json({ error: 'Proxy server failed', details: error.message });
  }
}
