import { Controller, Query, Sse, MessageEvent, Get, Res } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiService } from './ai.service';
import type { Response } from 'express';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('chat')
  async chat(@Query('query') query: string) {
    const answer = await this.aiService.runChain(query);
    return { answer };
  }

  // ai.controller.ts
  @Sse('chat/stream')
  chatStream(
    @Query('query') query: string,
    @Res({ passthrough: true }) res: Response,
  ): Observable<MessageEvent> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁止 nginx 缓冲（如果有代理）

    return new Observable((observer) => {
      this.aiService
        .runChainStream(query, (chunk) => {
          observer.next({
            data: JSON.stringify({ content: chunk, done: false }),
          });
        })
        .then(() => {
          observer.next({
            data: JSON.stringify({ content: '', done: true }),
          });
          observer.complete();
        })
        .catch((err) => observer.error(err));
    });
  }
}
