// api/retrieve.js
export default async function handler(request, response) {
  try {
    const pageId = request.body.page_id;
    const startCursor = request.body.start_cursor; // 다음 페이지를 위한 '책갈피'

    if (!pageId) {
      return response.status(400).json({ error: 'Proxy Error: page_id is missing.' });
    }

    let notionApiUrl = `https://api.notion.com/v1/blocks/${pageId}/children`;
    
    // start_cursor가 있으면 URL에 페이지네이션 파라미터 추가
    if (startCursor) {
      notionApiUrl += `?start_cursor=${startCursor}`;
    }

    const { headers } = request;
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Notion-Version': '2022-06-28',
    };

    const notionResponse = await fetch(notionApiUrl, { method: 'GET', headers: notionHeaders });

    if (!notionResponse.ok) {
      const errorData = await notionResponse.json();
      throw new Error(`Notion API Error: ${notionResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await notionResponse.json();
    // 노션의 응답(results, has_more, next_cursor 포함)을 그대로 반환
    response.status(200).json(data);

  } catch (error) {
    console.error('Detailed proxy error:', error);
    response.status(500).json({ error: 'Proxy server encountered an error.', details: error.message });
  }
}
