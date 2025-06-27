// api/shared_functions.js
const { createClient } = require('@vercel/kv');
const Airtable = require('airtable');

const kv = createClient({ /* ... */ });
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

// 입력이 객체인지 문자열인지 지능적으로 판단하는 헬퍼 함수
const getText = (input) => (typeof input === 'object' && input !== null && input.text) ? input.text : input;

const primitiveFunctions = {
    getTextFromInput: {
        description: "입력 객체에서 'text' 속성 값을 추출합니다.",
        function: (input) => {
          if (input && typeof input.text === 'string') return input; // 다음 단계를 위해 객체 전체를 전달
          if (typeof input === 'string') return { text: input }; // 문자열이면 객체로 감쌈
          throw new Error("Invalid input for getTextFromInput.");
        }
    },
    // ... 다른 모든 함수들도 getText(input)을 사용하도록 수정 ...
    summarizeText: {
        description: "텍스트를 50자 이내로 요약합니다.",
        function: (input) => {
          const text = getText(input);
          if (typeof text !== 'string') throw new Error("Invalid input for summarizeText.");
          return text.substring(0, 50) + "... (summarized)";
        }
    },
    storeToAirtable: {
        description: "결과를 새로운 Airtable 레코드에 저장.",
        function: async (input) => {
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
    // ... 기타 모든 함수들 ...
};

module.exports = { primitiveFunctions, getText };
