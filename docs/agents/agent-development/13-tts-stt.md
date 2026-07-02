# TTS 与 ASR：给 AI Agent 装上嘴巴和耳朵

> 示例代码：`examples/tts-stt-test/`

## 概览

TTS（文字转语音）和 ASR（语音转文字）让 Agent 从「只能打字」变成「能说能听」。三个 Demo 文件覆盖了完整链路：

```
tts-test.mjs            文字 → 音频文件（HTTP 同步）
streaming-tts-test.mjs  文字分段 → 流式音频（WebSocket）
asr-test.mjs            音频文件 → 文字（HTTP 同步）
```

## TTS：文字转语音

### 基础版（HTTP 同步请求）

```
文字 → 腾讯云 TTS API → Base64 音频 → Buffer.from() 解码 → fs.writeFile() → output.mp3
```

核心概念：
- **Base64**：HTTP/JSON 只能传文本，mp3 是二进制，Base64 是「二进制 ↔ 文本」互转方案
- **VoiceType**：音色编号，如 `502006` 对应腾讯云某个预置音色

局限性：等全部合成完才返回，长文本等待太久。

### 流式版（WebSocket 边生成边播放）

| | 基础版 | 流式版 |
|---|---|---|
| 协议 | HTTPS | WebSocket |
| 模式 | 一问一答 | 持续双向通信 |
| 体验 | 等全部合成 | 边合成边播放 |

关键流程：
```
buildWsUrl() 签名 → WebSocket 连接 → ws.on("open")
  → ws.on("message")：区分 JSON 帧（控制）和二进制帧（音频数据）
  → 文字逐段发送 → 音频逐片写入 → final=1 关闭
```

真实场景：LLM 边输出文字 → 立刻把每句发给 TTS → 第一句还没播完第二句已在合成。

## ASR：语音转文字

```
output.mp3 → fs.readFileSync() → Buffer → .toString("base64")
  → 腾讯云 ASR API → data.Result → 识别文字
```

和 TTS 的结构完全对称：

| | TTS | ASR |
|---|---|---|
| 包 | `tencentcloud-sdk-nodejs-tts` | `tencentcloud-sdk-nodejs-asr` |
| 核心 API | `TextToVoice` | `SentenceRecognition` |
| 方向 | 文字 → Base64 音频 | 音频 Base64 → 文字 |
| 超时 | 默认 | 30s（音频比文字慢） |

> `SentenceRecognition` 适合 60 秒以内短音频。长录音用 `CreateRecTask` 异步接口，实时流用 WebSocket 版。

## 完整语音 Agent 链路

```
🎤 用户说话
  → ASR：音频 → Base64 → 腾讯云 → 文字
  → LLM Agent：文字 → ReAct 循环 → 调工具 → 生成回复
  → 流式 TTS：文字片段 → WebSocket → 音频片段 → 播放
  → 🔊 用户听到回答
```

## 核心收获

- **TTS 和 ASR 是对称的**——一个是文字→音频，一个是音频→文字，数据都在经过 Base64 这座桥
- **流式 TTS + WebSocket** 是给 Agent 做语音交互的关键——用户体验不在"合成快"，而在"第一句出来快"
- 腾讯云 SDK 的包名按服务名+版本号管理：`tts.v20190823.Client` → 服务 `tts`，版本 `v20190823`
