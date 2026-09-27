// Dev harness: serves the app + fakes OpenRouter's streaming chat endpoint, so the whole flow runs without an API key.
// Run from the repo root: node dev/mock.mjs  → http://localhost:8765
// In ⚙ set URL to http://localhost:8765/openrouter.ai/v1/chat/completions ("openrouter.ai" in the path enables the
// OpenRouter-only fields), any key; key "bad" → 401. Every request is summarised to stdout (audio → WAV header check).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.argv[2] || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function wavInfo(b64) {
  const b = Buffer.from(b64, 'base64');
  return {riff: b.toString('ascii', 0, 4), wave: b.toString('ascii', 8, 12), channels: b.readUInt16LE(22),
    rate: b.readUInt32LE(24), bits: b.readUInt16LE(34), seconds: b.readUInt32LE(40) / b.readUInt32LE(28)};
}

http.createServer(async (req, res) => {
  if (req.method == 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}); return res.end(); }
  if (req.method == 'POST') {
    let body = ''; for await (const c of req) body += c;
    const j = JSON.parse(body);
    console.log(JSON.stringify({model: j.model, models: j.models, reasoning: j.reasoning, tools: j.tools,
      messages: j.messages.map(m => typeof m.content == 'string' ? m.content.slice(0, 60) :
        m.content.map(p => p.type == 'input_audio' ? wavInfo(p.input_audio.data) : p.type == 'image_url' ? p.image_url.url.slice(0, 23) : p.text))}));
    if (req.headers.authorization == 'Bearer bad') { res.writeHead(401, {'access-control-allow-origin': '*'}); return res.end('{"error":{"message":"No auth credentials found","code":401}}'); }
    const text = j.messages[0].content.includes('interpreter')
      ? '```json\n{"heard": "Сколько стоит?", "tr": "这个多少钱？"}\n```'
      : 'Ответ ассистента.\nСкажите: 请问洗手间在哪里？ (qǐngwèn)';
    let sse = ': OPENROUTER PROCESSING\n\n';
    for (const piece of text.match(/[\s\S]{1,7}/g)) sse += 'data: ' + JSON.stringify({choices: [{delta: {content: piece}}]}) + '\n\n';
    sse += 'data: [DONE]\n\n';
    res.writeHead(200, {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'});
    for (let i = 0; i < sse.length; i += 13) { res.write(sse.slice(i, i + 13)); await sleep(5); } // split mid-line on purpose
    return res.end();
  }
  const f = path.join(APP, req.url.split('?')[0] == '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(f));
}).listen(8765, () => console.log('mock on http://localhost:8765'));
