# Base64

## 一句话

**二进制数据（图片、音频）的「文字版」。** 把 0/1 二进制用 64 个可打印字符来表示，让二进制数据能在 JSON/HTTP 等纯文本协议里传输。

## 核心直觉

HTTP/JSON 只能传文本——你没法把一张 `.mp3` 文件的原始二进制直接放到 JSON 里。Base64 把二进制每 6 bit 映射为一个可打印字符，这样二进制数据就「伪装」成了文本，能在纯文本通道中安全传输。

```
二进制 mp3 数据 → Base64 编码 → 纯文本字符串 → JSON 传输 → Base64 解码 → 还原 mp3
```

## 为什么在 AI 开发中会碰到

在 TTS/ASR 语音交互中大量使用：

```js
// TTS：腾讯云返回 Base64 音频 → 解码成 mp3 文件
const audioBuffer = Buffer.from(base64String, 'base64');
fs.writeFileSync('output.mp3', audioBuffer);

// ASR：mp3 文件 → 编码成 Base64 → 发送给腾讯云
const audioBase64 = fs.readFileSync('input.mp3').toString('base64');
await asrClient.SentenceRecognition({ Data: audioBase64 });
```

## 小结

Base64 不需要你记编码表、不需要手算——Buffer 一行代码搞定。但你需要知道它是「二进制和文本之间的翻译官」，以及为什么 JSON API 返回的音频字段是一长串看不懂的字母。

## 下一步

- [SSE](./sse.md) — 流式传输文本
- [WebSocket](./websocket.md) — 传输二进制帧（不需要 Base64）
