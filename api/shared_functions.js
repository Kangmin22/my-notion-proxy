// api/shared_functions.js
const { createClient } = require('@vercel/kv');
const Airtable = require('airtable');

// ✅ 수정된 부분: UPSTASH 환경 변수 사용
const kv = createClient({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

const getText = (input) => (typeof input === 'object' && input !== null && input.text) ? input.text : input;

const primitiveFunctions = {
    getTextFromInput: {
        description: "입력 객체에서 'text' 속성 값을 추출하거나, 문자열 입력을 그대로 반환합니다.",
        function: (input) => {
          console.log("Executing: getTextFromInput");
          if (input && typeof input.text === 'string') return input;
          if (typeof input === 'string') return { text: input };
          throw new Error("Invalid input for getTextFromInput.");
        }
    },
    summarizeText: {
        description: "텍스트를 50자 이내로 요약합니다.",
        function: (input) => {
          console.log("Executing: summarizeText");
          const text = getText(input);
          if (typeof text !== 'string') throw new Error("Invalid input for summarizeText.");
          return text.substring(0, 50) + "... (summarized)";
        }
    },
    formatList: {
        description: "개행 문자 기준 목록으로 포맷.",
        function: (input) => {
          console.log("Executing: formatList");
          const text = getText(input);
          if (typeof text !== 'string') throw new Error("Invalid input for formatList.");
          return text.split('\n').map(line => `- ${line}`).join('\n');
        }
    },
    storeToAirtable: {
        description: "결과를 새로운 Airtable 레코드에 저장.",
        function: async (input) => {
          console.log("Executing: storeToAirtable");
          const text = getText(input);
          const newRecord = {
            "Prompt Name": `Pipeline Result - ${new Date().toISOString()}`,
            "Status": "최종 완료",
            "Goal": String(text)
          };
          const createdRecords = await base(tableName).create([{ fields: newRecord }]);
          return `Stored result in Airtable. Record ID: ${createdRecords[0].getId()}`;
        }
    },
    logOutput: {
        description: "최종 결과 로그 문자열 생성.",
        function: (input) => {
          console.log("Executing: logOutput");
          const text = getText(input);
          return `[Execution Result Log]: ${text}`;
        }
    },
    // ... (11.md에
