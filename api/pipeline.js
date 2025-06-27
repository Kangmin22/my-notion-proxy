// api/pipeline.js
const { createClient } = require('@vercel/kv');
const yaml = require('js-yaml');
const Airtable = require('airtable');

// Vercel KV 클라이언트 초기화
const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

// Airtable 클라이언트 초기화
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const tableName = process.env.AIRTABLE_TABLE_NAME;

// 모든 실행 가능한 기초 함수 모음
const primitiveFunctions = {
    // === 기존 함수 ===
    getTextFromInput: {
        description: "입력 객체에서 'text' 속성 값을 추출합니다.",
        function: (input) => {
          console.log("Executing: getTextFromInput");
          if (input && typeof input.text === 'string') return input.text;
          if (typeof input === 'string') return input;
          throw new Error("Invalid input for getTextFromInput.");
        }
    },
    summarizeText: { /* ...생략... */ },
    formatList: { /* ...생략... */ },
    storeToAirtable: { /* ...생략... */ },
    logOutput: { /* ...생략... */ },
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

    // === 1. 입력 처리 함수 (Preprocessing) ===
    trimWhitespace: {
        description: "텍스트의 앞뒤 공백을 제거합니다.",
        function: (text) => {
            console.log("Executing: trimWhitespace");
            return String(text).trim();
        }
    },
    normalizeNewlines: {
        description: "다양한 형태의 줄바꿈 문자를 \\n으로 통일합니다.",
        function: (text) => {
            console.log("Executing: normalizeNewlines");
            return String(text).replace(/\r\n|\r/g, '\n');
        }
    },
    splitByDelimiter: {
        description: "구분자로 문자열을 나누어 배열로 만듭니다. 입력: { text: 'a,b,c', delimiter: ',' }",
        function: (input) => {
            console.log("Executing: splitByDelimiter");
            const { text, delimiter = ',' } = input;
            if(typeof text !== 'string') throw new Error("Input 'text' must be a string for splitByDelimiter.");
            return text.split(delimiter);
        }
    },

    // === 2. 분석/추출 함수 ===
    extractKeywords: {
        description: "텍스트에서 간단한 방법으로 핵심 키워드를 추출합니다.",
        function: (text) => {
            console.log("Executing: extractKeywords");
            const words = String(text).toLowerCase().match(/\b(\w+)\b/g) || [];
            const freq = words.reduce((acc, word) => {
                acc[word] = (acc[word] || 0) + 1;
                return acc;
            }, {});
            return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(entry => entry[0]);
        }
    },
    detectLanguage: {
        description: "텍스트 언어를 판별합니다. (현재는 한글/영어만 간이 판별)",
        function: (text) => {
            console.log("Executing: detectLanguage");
            const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
            return koreanRegex.test(text) ? 'ko' : 'en';
        }
    },
    countWords: {
        description: "텍스트의 단어 수를 계산합니다.",
        function: (text) => {
            console.log("Executing: countWords");
            const matches = String(text).match(/\b(\w+)\b/g);
            return matches ? matches.length : 0;
        }
    },

    // === 3. 후처리 및 출력용 함수 ===
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
            if (!Array.isArray(data) || !data.every(Array.isArray)) {
                throw new Error("Input for formatAsTable must be an array of arrays.");
            }
            const [header, ...rows] = data;
            const headerLine = `| ${header.join(' | ')} |`;
            const separatorLine = `| ${header.map(() => '---').join(' | ')} |`;
            const rowLines = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
            return [headerLine, separatorLine, rowLines].join('\n');
        }
    },

    // === 4. 외부 저장/전송 함수 ===
    storeToFilesystem: {
        description: "[PLACEHOLDER] 결과를 파일 시스템(S3 등)에 저장합니다. (구현 필요)",
        function: async (text) => {
            console.log("Executing: storeToFilesystem (Placeholder)");
            // 실제 S3 업로드 로직 등은 여기에 구현 필요
            const message = `[Placeholder] Data would be saved to a file system. Content: ${String(text).substring(0, 50)}...`;
            console.log(message);
            return message;
        }
    },
    sendToWebhook: {
        description: "결과를 지정된 외부 URL로 POST 전송합니다. 입력: { url: '...', payload: ... }",
        function: async (input) => {
            console.log("Executing: sendToWebhook");
            const { url, payload } = input;
            if (!url || !payload) throw new Error("Input for sendToWebhook must be an object with 'url' and 'payload'.");
            
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

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
            history.push({ timestamp: new Date().toISOString(), result: text });
            await kv.set(historyKey, history);
            return `Result pushed to history. History now contains ${history.length} items.`;
        }
    },

    // === 5. 유틸/디버깅 함수 ===
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

// 이름으로 Airtable 레코드를 찾는 함수 (캐시 기능 포함)
async function getRecordByName(promptName) { /* ...이전과 동일... */ }

// 파이프라인 실행기 메인 로직 v3
module.exports = async (request, response) => {
    // ...
    // 함수 ID와 실제 함수 이름을 매핑하는 객체
    const idToFunctionMap = {
      // 기존
      extract_input: "getTextFromInput",
      summarize: "summarizeText",
      finalize: "logOutput",
      format_list: "formatList",
      store_result: "storeToAirtable",
      export_document: "exportToDocumentSystem",
      // 신규
      trim: "trimWhitespace",
      normalize_lines: "normalizeNewlines",
      split: "splitByDelimiter",
      keywords: "extractKeywords",
      detect_lang: "detectLanguage",
      count_words: "countWords",
      md_code: "wrapInMarkdownCodeBlock",
      to_json: "wrapInJSON",
      to_table: "formatAsTable",
      to_file: "storeToFilesystem",
      webhook: "sendToWebhook",
      push_history: "pushToHistoryKV",
      log: "logInput",
      pass: "noop",
      now: "timestamp",
    };
    // ... 파이프라인의 나머지 로직은 이전과 동일 ...
};
