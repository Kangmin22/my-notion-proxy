// api/functions.js
const { primitiveFunctions } = require('./pipeline.js');

module.exports = async (request, response) => {
  // [추가된 기능] 어떤 HTTP 메서드로 요청이 오는지 로그를 남김
  console.log(`Incoming ${request.method} request to /api/functions`);

  // GET과 POST 요청을 모두 허용하도록 수정
  if (request.method !== 'POST' && request.method !== 'GET') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }
  
  try {
    const functionDocs = Object.entries(primitiveFunctions).map(([name, data]) => ({
      name: name,
      description: data.description,
    }));
    response.status(200).json({ functions: functionDocs });
  } catch (error) {
    console.error("Functions API Error:", error);
    response.status(500).json({ error: "Failed to retrieve function documentation." });
  }
};
