// api/getDBInfo.js
export default async function handler(request, response) {
  try {
    const databaseId = request.body.database_id;
    if (!databaseId) {
      return response.status(400).json({ error: 'Proxy Error: Database ID is missing.' });
    }

    // 데이터베이스 정보 조회를 위한 노션 API 엔드포인트
    const notionApiUrl = `https://api.notion.com/v1/databases/${databaseId}`;

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Notion-Version': '2022-06-28',
    };

    // 노션 API로 GET 요청을 보냅니다.
    const notionResponse = await fetch(notionApiUrl, {
      method: 'GET',
      headers: notionHeaders,
    });

    if (!notionResponse.ok) {
      const errorData = await notionResponse.json();
      throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await notionResponse.json();
    // 전체 정보 대신, 우리가 필요한 'properties' 객체만 추출해서 반환합니다.
    response.status(200).json(data.properties);

  } catch (error) {
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
