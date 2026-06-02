# TTS（文字转语音）与 ASR（语音转文字）

## 三个文件的关系

```
tts-test.mjs             文字 → 音频文件（HTTP 同步）
streaming-tts-test.mjs   文字(分段) → 音频文件（WebSocket 流式）
asr-test.mjs             音频文件 → 文字（HTTP 同步）
```

---

## 1. tts-test.mjs — 基础 TTS

### 流程

```
文字 → 腾讯云 TTS API → Base64 音频 → Buffer.from() 解码 → fs.writeFile() → output.mp3
```

### 核心概念

**`tencentcloud-sdk-nodejs-tts` 包结构：**
```
tts.v20190823.Client
    ↑        ↑
 服务名    版本号（按日期管理）
```

**VoiceType 音色编号：** `502006` 对应腾讯云预置的某个音色。

**Base64 的作用：** HTTP/JSON 只能传文本，mp3 是二进制，Base64 是「二进制 ↔ 文本」互转方案。

### 局限性

```diff
- 调用 TextToVoice → 等全部合成完 → 返回完整音频 → 播放
+ 长文本等待太久，用户只能转圈
+ streaming-tts-test.mjs 用 WebSocket 解决了这个问题
```

---

## 2. streaming-tts-test.mjs — 流式 TTS

### 与普通版的本质区别

| | tts-test | streaming-tts-test |
|--|---------|-------------------|
| 协议 | HTTPS | WebSocket |
| 模式 | 一问一答 | 持续双向通信 |
| 体验 | 等全部合成 → 一次性播放 | 边合成边播放 |

### WebSocket 基础

```
HTTP:   客户端 → 发请求 → 服务端返回 → 断开
WebSocket: 客户端 ←→ 持续双向通信，直到主动关闭
```

### 完整流程

```
buildWsUrl() 生成签名URL
  → new WebSocket(url) 建立长连接
  → ws.on("open") 连接就绪
  → ws.on("message") 收消息：
      ready=1    → sendTexts() 开始逐段发文字
      isBinary   → 写音频片段到文件
      final=1    → closeAll() 关闭一切
```

### 签名 URL 的生成（buildWsUrl）

```
参数按字母排序 → 拼成 key=value&key=value → HMAC-SHA1(SecretKey) → Base64
```

没有签名 = 任何人知道 URL 就能调用你的 API，费用由你承担。

### 分段发送文字（sendTexts）

```js
for (const text of TEXTS) {
  ws.send(JSON.stringify({ action: "ACTION_SYNTHESIS", data: text }));
  await sleep(3000);  // 模拟 LLM 流式输出间隔
}
ws.send(JSON.stringify({ action: "ACTION_COMPLETE" }));
```

真实场景：LLM 边输出文字 → 立刻把每句发给 TTS → 第一句还在说话时第二句已在后台合成。

### 消息类型的区分

| 类型 | 内容 | 含义 |
|------|------|------|
| 文本(JSON) | `{ ready: 1 }` | 服务端就绪 |
| 文本(JSON) | `{ final: 1 }` | 合成完成 |
| 二进制 | mp3 音频数据 | 音频片段，直接写文件 |

### 防重复关闭（closeAll）

```js
let closed = false;
const closeAll = () => { if (closed) return; closed = true; /* 关闭 ws + file stream */ };
```

`final=1`、`ws.on("close")`、`ws.on("error")` 都可能触发关闭，加了 `closed` 标志防止重复调用 `end()`。

---

## 3. asr-test.mjs — ASR 语音识别

### 流程

```
output3.mp3 → fs.readFileSync() → Buffer → .toString("base64")
  → 腾讯云 ASR API → data.Result → 识别出的文字
```

### 和 TTS 的结构对称

```
TTS: 文字 → API → Base64 → Buffer → mp3
ASR: mp3 → Buffer → Base64 → API → 文字
```

### 客户端差异

| | TTS | ASR |
|--|-----|-----|
| 包 | `tencentcloud-sdk-nodejs-tts` | `tencentcloud-sdk-nodejs-asr` |
| 版本 | `v20190823` | `v20190614` |
| 地区 | `ap-beijing` | `ap-shanghai` |
| 请求方式 | 默认 GET | `reqMethod: "POST"` |
| 超时 | 默认 | `reqTimeout: 30`（音频比文字慢） |

### 关键参数

| 参数 | 值 | 含义 |
|------|-----|------|
| `EngSerViceType` | `"16k_zh"` | 16kHz 中文 |
| `SourceType` | `1` | 传 Base64（0 = 传 URL） |
| `DataLen` | `Buffer.byteLength(audioBase64)` | **Base64 字符串的字节数**，不是原始音频 |

### SentenceRecognition 适用场景

- ✅ 60 秒以内短音频、语音指令、实时对话
- ❌ 长录音（应用录音文件识别异步接口）
- ❌ 实时麦克风流（应用实时语音识别 WebSocket 接口）

---

## 完整语音 Agent 链路

```
🎤 用户说话
  → ASR：音频 → Base64 → 腾讯云 → 文字
  → LLM Agent：文字 → ReAct 循环 → 调工具 → 生成回复
  → 流式 TTS：文字片段 → WebSocket → 音频片段 → 播放
  → 🔊 用户听到回答
```

---

## 三个文件知识点总结

| 文件 | 协议 | 方向 | 核心 API | 关键概念 |
|---|---|---|---|---|
| `tts-test.mjs` | HTTPS | 文字→音频 | `TextToVoice` | Base64 解码 |
| `streaming-tts-test.mjs` | WebSocket | 文字→音频(流式) | `TextToStreamAudioWSv2` | 长连接、二进制帧、签名 |
| `asr-test.mjs` | HTTPS | 音频→文字 | `SentenceRecognition` | Base64 编码、POST 上传 |
