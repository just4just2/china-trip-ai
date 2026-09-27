// Dev harness: serves the app + fakes OpenRouter's streaming chat endpoint, so the whole flow runs without an API key.
// Run from the repo root: node dev/mock.mjs  → http://localhost:8765
// In ⚙ set URL to http://localhost:8765/openrouter.ai/v1/chat/completions ("openrouter.ai" in the path enables the
// OpenRouter-only fields), any key; key "bad" → 401, "slow" → 35s without data. Requests go to stdout (audio → WAV header check).
// Interpreter: typed Chinese → Russian reply with a price (either button), anything else → Chinese reply.
// .../audio/speech (TTS) → a 0.3 s beep as WAV instead of the real mp3.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.argv[2] || '.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const beep = Buffer.alloc(44 + 4800 * 2); // 16 kHz mono 16-bit, 440 Hz
beep.write('RIFF', 0); beep.writeUInt32LE(36 + 9600, 4); beep.write('WAVEfmt ', 8); beep.writeUInt32LE(16, 16); beep.writeUInt16LE(1, 20);
beep.writeUInt16LE(1, 22); beep.writeUInt32LE(16000, 24); beep.writeUInt32LE(32000, 28); beep.writeUInt16LE(2, 32); beep.writeUInt16LE(16, 34);
beep.write('data', 36); beep.writeUInt32LE(9600, 40);
for (let i = 0; i < 4800; i++) beep.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16000) * 8000), 44 + i * 2);

function wavInfo(b64) {
  const b = Buffer.from(b64, 'base64');
  return {riff: b.toString('ascii', 0, 4), wave: b.toString('ascii', 8, 12), channels: b.readUInt16LE(22),
    rate: b.readUInt32LE(24), bits: b.readUInt16LE(34), seconds: b.readUInt32LE(40) / b.readUInt32LE(28)};
}

http.createServer(async (req, res) => {
  if (req.method == 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}); return res.end(); }
  if (req.method == 'POST') {
    let body = ''; for await (const c of req) body += c;
    const j = JSON.parse(body), tts = req.url.endsWith('/audio/speech');
    console.log(JSON.stringify(tts ? {tts: j.model, voice: j.voice, input: j.input, response_format: j.response_format} : {model: j.model, models: j.models, reasoning: j.reasoning, tools: j.tools,
      messages: j.messages.map(m => typeof m.content == 'string' ? m.content.slice(0, 60) :
        m.content.map(p => p.type == 'input_audio' ? wavInfo(p.input_audio.data) : p.type == 'image_url' ? p.image_url.url.slice(0, 23) : p.text))}));
    if (req.headers.authorization == 'Bearer bad') { res.writeHead(401, {'access-control-allow-origin': '*'}); return res.end('{"error":{"message":"No auth credentials found","code":401}}'); }
    if (req.headers.authorization == 'Bearer slow') { await sleep(35000); if (res.destroyed) return; }
    if (tts) { res.writeHead(200, {'content-type': 'audio/wav', 'access-control-allow-origin': '*'}); return res.end(beep); }
    const said = typeof j.messages.at(-1).content == 'string' ? j.messages.at(-1).content : 'Сколько стоит?';
    const text = j.messages[0].content.includes('interpreter')
      ? '```json\n' + JSON.stringify({heard: said, tr: /[一-鿿]/u.test(said) ? 'Это стоит 80 юаней.' : '这个多少钱？'}) + '\n```'
      : 'Ответ ассистента.\nСкажите: 请问洗手间在哪里？ (qǐngwèn)\n📍 南京东路100号\n🧠 Отель на Nanjing East Road';
    let sse = ': OPENROUTER PROCESSING\n\n';
    if (!j.messages[0].content.includes('interpreter')) sse += 'data: ' + JSON.stringify({choices: [{delta: {reasoning: 'Thinking'}}]}) + '\n\n';
    for (const piece of text.match(/[\s\S]{1,7}/g)) sse += 'data: ' + JSON.stringify({choices: [{delta: {content: piece}}]}) + '\n\n';
    sse += 'data: [DONE]\n\n';
    res.writeHead(200, {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'});
    for (let i = 0; i < sse.length; i += 13) { if (res.destroyed) return; res.write(sse.slice(i, i + 13)); await sleep(5); } // split mid-line on purpose
    return res.end();
  }
  const f = path.join(APP, req.url.split('?')[0] == '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(f));
}).listen(8765, () => console.log('mock on http://localhost:8765'));
