// api/functions.js
// execute.js에서 정의한 함수 라이브러리를 가져옵니다.
import { primitiveFunctions } from './execute.js';

export default async function handler(request, response) {
  try {
    // 라이브러리의 각 함수에서 실행 로직을 제외하고 이름과 설명만 추출합니다.
    const functionDocs = Object.entries(primitiveFunctions).map(([name, data]) => ({
      name: name,
      description: data.description,
    }));

    response.status(200).json({ functions: functionDocs });
  } catch (error) {
    response.status(500).json({ error: "Failed to retrieve function documentation." });
  }
}
