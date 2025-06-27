// api/shared_functions.js
const { createClient } = require('@vercel/kv');
const Airtable = require('airtable');

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
          if (input && typeof input.text === 'string') return input.text;
          if (typeof input === 'string') return input;
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
        function: async (text) => {
          console.log("Executing: storeToAirtable");
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
    exportToDocumentSystem: {
      description: "최종 결과를 내부 문서 저장소(Vercel KV)에 저장합니다.",
      function: async (text) => {
        console.log("Executing: exportToDocumentSystem");
        const documentKey = `document:${new Date().toISOString()}`;
        await kv.set(documentKey, String(text), { ex: 604800 }); // 7일간 저장
        const successMessage = `Result successfully saved to internal document store with key: ${documentKey}`;
        console.log(successMessage);
        return successMessage;
      }
    },
    trimWhitespace: {
        description: "텍스트의 앞뒤 공백을 제거합니다.",
        function: (input) => {
            console.log("Executing: trimWhitespace");
            return String(getText(input)).trim();
        }
    },
    normalizeNewlines: {
        description: "다양한 형태의 줄바꿈 문자를 \\n으로 통일합니다.",
        function: (input) => {
            console.log("Executing: normalizeNewlines");
            return String(getText(input)).replace(/\r\n|\r/g, '\n');
        }
    },
    splitByDelimiter: {
        description: "구분자로 문자열을 나누어 배열로 만듭니다. 입력: { text: 'a,b,c', delimiter: ',' }",
        function: (input) => {
            console.log("Executing: splitByDelimiter");
            if (typeof input !== 'object' || input === null || typeof input.text !== 'string') {
                throw new Error("Input for splitByDelimiter must be an object like { text: '...', delimiter: '...' }");
            }
            const { text, delimiter = ',' } = input;
            return text.split(delimiter);
        }
    },
    extractKeywords: {
        description: "텍스트에서 간단한 방법으로 핵심 키워드를 추출합니다.",
        function: (input) => {
            console.log("Executing: extractKeywords");
            const text = getText(input);
            const stopWords = new Set(['i', 'me', 'my', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'in', 'on', 'at', 'to', 'for', 'with']);
            const words = String(text).toLowerCase().match(/\b(\w+)\b/g) || [];
            const freq = words.reduce((acc, word) => {
                if (!stopWords.has(word) && isNaN(word)) {
                    acc[word] = (acc[word] || 0) + 1;
                }
                return acc;
            }, {});
            return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(entry => entry[0]);
        }
    },
    detectLanguage: {
        description: "텍스트 언어를 판별합니다. (현재는 한글/영어만 간이 판별)",
        function: (input) => {
            console.log("Executing: detectLanguage");
            const text = getText(input);
            const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
            return koreanRegex.test(String(text)) ? 'ko' : 'en';
        }
    },
    countWords: {
        description: "텍스트의 단어 수를 계산합니다.",
        function: (input) => {
            console.log("Executing: countWords");
            const text = getText(input);
            const matches = String(text).match(/\b(\w+)\b/g);
            return matches ? matches.length : 0;
        }
    },
    wrapInMarkdownCodeBlock: {
        description: "결과를 Markdown 코드 블록으로 감쌉니다.",
        function: (text) => {
            console.log("Executing: wrapInMarkdownCodeBlock");
            return "```\n" + String(text) + "\n```";
        }
    },
    wrapInJSON: {
        description: "결과를 { result: ... } 형태의 JSON 객체로 감쌉니다.",
        function: (text) => {
            console.log("Executing: wrapInJSON");
            return { result: text };
        }
    },
    formatAsTable: {
        description: "2차원 배열 데이터를 Markdown 테이블로 포맷합니다.",
        function: (data) => {
            console.log("Executing: formatAsTable");
            if (!Array.isArray(data) || data.length === 0 || !data.every(Array.isArray)) {
                throw new Error("Input for formatAsTable must be a non-empty array of arrays.");
            }
            const [header, ...rows] = data;
            if(!header) return "";
            const headerLine = `| ${header.join(' | ')} |`;
            const separatorLine = `| ${header.map(() => '---').join(' | ')} |`;
            const rowLines = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
            return [headerLine, separatorLine, rowLines].join('\n');
        }
    },
    storeToFilesystem: {
        description: "[PLACEHOLDER] 결과를 파일 시스템(S3 등)에 저장합니다. (구현 필요)",
        function: async (text) => {
            console.log("Executing: storeToFilesystem (Placeholder)");
            const message = `[Placeholder] Data would be saved to a file system. Content: ${String(getText(text)).substring(0, 50)}...`;
            return message;
        }
    },
    sendToWebhook: {
        description: "결과를 지정된 외부 URL로 POST 전송합니다. 입력: { url: '...', payload: ... }",
        function: async (input) => {
            console.log("Executing: sendToWebhook");
            if (typeof input !== 'object' || input === null || !input.url || !input.payload) {
                throw new Error("Input for sendToWebhook must be an object with 'url' and 'payload'.");
            }
            const { url, payload } = input;
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(`Webhook failed with status: ${res.status}`);
            return `Webhook sent successfully to ${url}.`;
        }
    },
    pushToHistoryKV: {
        description: "결과를 KV의 'execution_history' 키에 배열로 누적 저장합니다.",
        function: async (text) => {
            console.log("Executing: pushToHistoryKV");
            const historyKey = 'execution_history';
            let history = await kv.get(historyKey) || [];
            if (!Array.isArray(history)) history = [];
            history.push({ timestamp: new Date().toISOString(), result: text });
            await kv.set(historyKey, history);
            return `Result pushed to history. History now contains ${history.length} items.`;
        }
    },
    logInput: {
        description: "현재 step의 입력을 콘솔 로그로 남기고 그대로 반환합니다.",
        function: (input) => {
            console.log("LogInput:", input);
            return input;
        }
    },
    noop: {
        description: "아무 작업도 하지 않고 입력을 그대로 반환합니다 (No-operation).",
        function: (input) => {
            console.log("Executing: noop");
            return input;
        }
    },
    timestamp: {
        description: "현재 시간의 ISO 문자열을 반환합니다.",
        function: () => {
            console.log("Executing: timestamp");
            return new Date().toISOString();
        }
    }
};

module.exports = { primitiveFunctions, getText };
