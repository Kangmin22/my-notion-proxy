// api/retrieve.js
export default async function handler(request, response) {
  try {
    const pageId = request.body.page_id;
    if (!pageId) {
      return response.status(400).json({ error: 'Proxy Error: Page ID is missing from the request body.' });
    }

    // 특정 페이지의 블록 자식들을 가져오는 노션 API 엔드포인트
    const notionApiUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;

    const { headers } = request;

    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
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
    response.status(200).json(data);

  } catch (error) {
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
