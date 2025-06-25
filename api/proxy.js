// api/proxy.js

export default async function handler(request, response) {
  // 1. 실제 노션 API 엔드포인트를 정의합니다.
  //    (GPTs의 paths가 /v1/pages 이므로, 이 프록시도 그 경로를 흉내 냅니다)
  const notionApiUrl = 'https://api.notion.com/v1/pages';

  try {
    // 2. GPT로부터 받은 요청(method, headers, body)을 그대로 가져옵니다.
    const { method, headers, body } = request;

    // 3. 노션으로 보낼 요청 헤더를 새로 만듭니다.
    //    중요: GPT가 보낸 Authorization 헤더(노션 토큰)는 그대로 사용합니다.
    const notionHeaders = {
      'Authorization': headers['authorization'],
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28', // <--- 바로 이 헤더를 우리가 직접 추가합니다!
    };

    // 4. 이 헤더와 함께 실제 노션 API로 요청을 전달(fetch)합니다.
    const notionResponse = await fetch(notionApiUrl, {
      method: method,
      headers: notionHeaders,
      body: JSON.stringify(body),
    });

    // 5. 노션 API로부터 받은 응답 데이터를 가져옵니다.
    const data = await notionResponse.json();

    // 6. 노션의 응답을 그대로 GPT에게 다시 돌려줍니다.
    response.status(notionResponse.status).json(data);

  } catch (error) {
    // 만약 에러가 발생하면, 에러 내용을 GPT에게 알려줍니다.
    response.status(500).json({ error: 'Proxy server failed', details: error.message });
  }
}
