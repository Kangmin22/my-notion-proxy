// api/functions.js
const { primitiveFunctions } = require('./shared_functions.js'); // 공통 파일에서 함수 목록 가져오기

module.exports = async (request, response) => {
  console.log(`Incoming ${request.method} request to /api/functions`);

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
