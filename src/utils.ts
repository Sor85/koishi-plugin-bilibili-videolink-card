import { Schema, Logger, h, Context, Session } from "koishi";
import type { Config } from './index';

// 队列任务接口
interface QueueTask {
    session: Session;
    ret: string;
    options?: { video?: boolean; audio?: boolean; link?: boolean };
}

// 缓冲区任务接口
interface BufferTask {
    session: Session;
    ret: string;
    options?: { video?: boolean; audio?: boolean; link?: boolean };
    timestamp: number;
}

// Session 级别的任务接口
interface SessionTask {
    session: Session;
    sessioncontent: string;
    timestamp: number;
}

export class BilibiliParser {
    private lastProcessedUrls: Record<string, number> = {};
    private processingQueue: QueueTask[] = []; // 待处理队列
    private isProcessing: boolean = false; // 是否正在处理
    private bufferQueue: BufferTask[] = []; // 缓冲队列
    private bufferTimer: NodeJS.Timeout | null = null; // 缓冲定时器

    // Session 级别的队列控制
    private sessionQueue: SessionTask[] = []; // Session 缓冲队列
    private sessionTimer: NodeJS.Timeout | null = null; // Session 缓冲定时器
    private isProcessingSession: boolean = false; // 是否正在处理 Session

    constructor(private ctx: Context, private config: Config, private logger: Logger) { }

    public logInfo(...args: any[]) {
        if (this.config.loggerinfo) {
            (this.logger.info as (...args: any[]) => void)(...args);
        }
    }

    //  判断是否需要解析
    public async isProcessLinks(sessioncontent: string) {
        // 解析内容中的链接
        const links = this.link_type_parser(sessioncontent);
        if (links.length === 0) {
            return false; // 如果没有找到链接，返回 false
        }
        return links; // 返回解析出的链接
    }

    //提取链接
    public async extractLinks(session: Session, links: { type: string; id: string }[]) {
        let ret = "";
        if (!this.config.isfigure) {
            ret += h("quote", { id: session.messageId });
        }
        let countLink = 0;
        let tp_ret: string;

        // 循环检测链接类型
        for (const element of links) {
            if (countLink >= 1) ret += "\n";
            if (countLink >= this.config.parseLimit) {
                ret += "已达到解析上限…";
                break;
            }
            tp_ret = await this.type_processer(element);
            if (tp_ret == "") {
                if (this.config.showError)
                    ret = "无法解析链接信息。可能是 ID 不存在，或该类型可能暂不支持。";
                else
                    ret = null;
            } else {
                ret += tp_ret;
            }
            countLink++;
        }
        return ret;
    }

    //判断链接是否已经处理过
    public isLinkProcessedRecently(ret: string, channelId: string) {
        const lastretUrl = this.extractLastUrl(ret); // 提取 ret 最后一个 http 链接作为解析目标
        const currentTime = Date.now();

        //  channelId 作为 key 的一部分，分频道鉴别
        const channelKey = `${channelId}:${lastretUrl}`;

        if (lastretUrl && this.lastProcessedUrls[channelKey] && (currentTime - this.lastProcessedUrls[channelKey] < this.config.MinimumTimeInterval * 1000)) {
            this.ctx.logger.info(`重复出现，略过处理：\n ${lastretUrl} (频道 ${channelId})`);

            return true; // 已经处理过
        }

        // 更新该链接的最后处理时间，使用 channelKey
        if (lastretUrl) {
            this.lastProcessedUrls[channelKey] = currentTime;
        }
        return false; // 没有处理过
    }

    // 添加 session 到缓冲队列（middleware 入口调用）
    public async queueSession(session: Session, sessioncontent: string) {
        // 将 session 加入缓冲队列
        this.sessionQueue.push({ session, sessioncontent, timestamp: Date.now() });
        this.logInfo(`收到消息，Session缓冲区任务数: ${this.sessionQueue.length}`);

        // 清除之前的定时器
        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
        }

        // 设置新的定时器，等待配置的延迟时间后处理
        this.sessionTimer = setTimeout(() => {
            this.flushSessionBuffer();
        }, this.config.bufferDelay * 1000);
    }

    // 将 session 缓冲区的任务转移到处理队列
    private flushSessionBuffer() {
        if (this.sessionQueue.length === 0) {
            return;
        }

        this.logInfo(`Session缓冲时间结束，开始处理 ${this.sessionQueue.length} 个消息`);

        // 启动 session 队列处理
        if (!this.isProcessingSession) {
            this.processSessionQueue();
        }
    }

    // 处理 session 队列中的任务
    private async processSessionQueue() {
        if (this.isProcessingSession || this.sessionQueue.length === 0) {
            return;
        }

        this.isProcessingSession = true;
        this.logInfo(`开始处理Session队列，总任务数: ${this.sessionQueue.length}`);

        while (this.sessionQueue.length > 0) {
            const task = this.sessionQueue.shift();
            this.logInfo(`处理Session (剩余: ${this.sessionQueue.length})`);

            try {
                await this.processSessionTask(task.session, task.sessioncontent);
            } catch (error) {
                this.logger.error('处理Session任务时发生错误:', error);
            }
        }

        this.isProcessingSession = false;
        this.logInfo('Session队列处理完成');
    }

    // 实际处理单个 session 任务
    private async processSessionTask(session: Session, sessioncontent: string) {
        this.logInfo(`[队列] 开始处理消息: ${sessioncontent.substring(0, 50)}...`);

        const links = await this.isProcessLinks(sessioncontent);
        if (!links) {
            this.logInfo(`[队列] 未检测到链接`);
            return;
        }

        this.logInfo(`[队列] 检测到 ${links.length} 个链接`);

        // 逐个处理链接
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            this.logInfo(`[队列] 处理第 ${i + 1}/${links.length} 个链接`);

            const ret = await this.extractLinks(session, [link]);
            if (ret && !this.isLinkProcessedRecently(ret, session.channelId)) {
                this.logInfo(`[队列] 开始下载视频`);
                // 直接处理，不再使用视频级别的缓冲
                await this.processVideoTask(session, ret, { video: true });
                this.logInfo(`[队列] 视频处理完成`);
            } else {
                this.logInfo(`[队列] 链接已处理过，跳过`);
            }
        }

        this.logInfo(`[队列] Session 处理完成`);
    }

    // 添加任务到缓冲区（已废弃，保留兼容性）
    public async processVideoFromLink(session: Session, ret: string, options: { video?: boolean; audio?: boolean; link?: boolean } = { video: true }) {
        // 将任务加入缓冲队列
        this.bufferQueue.push({ session, ret, options, timestamp: Date.now() });
        this.logInfo(`收到解析请求，缓冲区任务数: ${this.bufferQueue.length}`);

        // 清除之前的定时器
        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
        }

        // 设置新的定时器，等待配置的延迟时间后处理
        this.bufferTimer = setTimeout(() => {
            this.flushBuffer();
        }, this.config.bufferDelay * 1000);
    }

    // 将缓冲区的任务转移到处理队列
    private flushBuffer() {
        if (this.bufferQueue.length === 0) {
            return;
        }

        this.logInfo(`缓冲时间结束，将 ${this.bufferQueue.length} 个任务加入处理队列`);

        // 将缓冲队列的任务转移到处理队列
        while (this.bufferQueue.length > 0) {
            const task = this.bufferQueue.shift();
            this.processingQueue.push({
                session: task.session,
                ret: task.ret,
                options: task.options
            });
        }

        // 启动队列处理
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    // 处理队列中的任务
    private async processQueue() {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        this.logInfo(`开始处理队列，总任务数: ${this.processingQueue.length}`);

        while (this.processingQueue.length > 0) {
            const task = this.processingQueue.shift();
            this.logInfo(`处理任务 (剩余: ${this.processingQueue.length})`);

            try {
                await this.processVideoTask(task.session, task.ret, task.options);
            } catch (error) {
                this.logger.error('处理视频任务时发生错误:', error);
            }
        }

        this.isProcessing = false;
        this.logInfo('队列处理完成');
    }

    // 实际处理单个视频任务
    private async processVideoTask(session: Session, ret: string, options: { video?: boolean; audio?: boolean; link?: boolean } = { video: true }) {
        const lastretUrl = this.extractLastUrl(ret);
        this.logInfo(`处理视频: ${lastretUrl}`);

        let waitTipMsgId: string = null;
        // 等待提示语单独发送
        if (this.config.waitTip_Switch) {
            const result = await session.send(`${h.quote(session.messageId)}${this.config.waitTip_Switch}`);
            waitTipMsgId = Array.isArray(result) ? result[0] : result;
        }

        let videoElements: any[] = []; // 用于存储视频相关元素
        let textElements: any[] = []; // 用于存储图文解析元素
        let shouldPerformTextParsing = this.config.videoParseComponents.includes('text');

        // 先进行图文解析
        if (shouldPerformTextParsing && lastretUrl && this.ctx.puppeteer) {
            const videoLink = this.link_type_parser(lastretUrl).find((link) => link.type === 'Video');
            if (videoLink) {
                try {
                    const info = await this.fetch_video_info(videoLink.id);
                    if (info?.data) {
                        const image = await this.renderVideoCard(info.data);
                        const elements = [h.image(image, 'image/png')];
                        if (this.config.bVideoShowLink) {
                            elements.push(h.text(this.getVideoUrl(info.data)));
                        }
                        textElements.push(h('message', {
                            userId: session.userId,
                            nickname: session.author?.nickname || session.username,
                        }, elements));
                    }
                } catch (error) {
                    this.logger.warn('生成视频图文卡片失败:', error);
                }
            }
        } else if (shouldPerformTextParsing && lastretUrl) {
            this.logger.warn('图文卡片需要 puppeteer 服务，已跳过图文解析');
        }

        // 视频/链接解析
        if (this.config.videoParseComponents.length > 0) {
            const fullAPIurl = `http://api.xingzhige.com/API/b_parse/?url=${encodeURIComponent(lastretUrl)}`;

            try {
                const responseData: any = await this.ctx.http.get(fullAPIurl);

                if (responseData.code === 0 && responseData.msg === "video" && responseData.data) {
                    const { bvid, cid, video } = responseData.data;
                    const bilibiliUrl = `https://api.bilibili.com/x/player/playurl?fnval=80&cid=${cid}&bvid=${bvid}`;
                    const playData: any = await this.ctx.http.get(bilibiliUrl);

                    if (playData.code === 0 && playData.data && playData.data.dash && playData.data.dash.duration) {
                        const videoDurationSeconds = playData.data.dash.duration;
                        const videoDurationMinutes = videoDurationSeconds / 60;

                        // 检查视频是否太短
                        if (videoDurationMinutes < this.config.Minimumduration) {

                            // 根据 Minimumduration_tip 的值决定行为
                            if (this.config.Minimumduration_tip === 'return') {
                                // 不返回文字提示，直接返回
                                return;
                            } else if (typeof this.config.Minimumduration_tip === 'object' && this.config.Minimumduration_tip !== null) {
                                // 返回文字提示
                                if (this.config.Minimumduration_tip.tipcontent) {
                                    if (this.config.Minimumduration_tip.tipanalysis) {
                                        videoElements.push(h.text(this.config.Minimumduration_tip.tipcontent));
                                    } else {
                                        await session.send(this.config.Minimumduration_tip.tipcontent);
                                    }
                                }

                                // 决定是否进行图文解析
                                shouldPerformTextParsing = this.config.Minimumduration_tip.tipanalysis === true;

                                // 如果不进行图文解析，清空已准备的文本元素
                                if (!shouldPerformTextParsing) {
                                    textElements = [];
                                }
                            }
                        }
                        // 检查视频是否太长
                        else if (videoDurationMinutes > this.config.Maximumduration) {

                            // 根据 Maximumduration_tip 的值决定行为
                            if (this.config.Maximumduration_tip === 'return') {
                                // 不返回文字提示，直接返回
                                return;
                            } else if (typeof this.config.Maximumduration_tip === 'object' && this.config.Maximumduration_tip !== null) {
                                // 返回文字提示
                                if (this.config.Maximumduration_tip.tipcontent) {
                                    if (this.config.Maximumduration_tip.tipanalysis) {
                                        videoElements.push(h.text(this.config.Maximumduration_tip.tipcontent));
                                    } else {
                                        await session.send(this.config.Maximumduration_tip.tipcontent);
                                    }
                                }

                                // 决定是否进行图文解析
                                shouldPerformTextParsing = this.config.Maximumduration_tip.tipanalysis === true;

                                // 如果不进行图文解析，清空已准备的文本元素
                                if (!shouldPerformTextParsing) {
                                    textElements = [];
                                }
                            }
                        } else {
                            // 视频时长在允许范围内，处理视频
                            let videoData: string = video.url; // 初始为原始 URL
                            let fileTooLarge = false; // 标记文件是否过大

                            if (this.config.filebuffer) {
                                try {
                                    // 使用 Node.js 原生 fetch 下载视频（仅获取 header 检查大小）
                                    const response = await fetch(video.url, {
                                        headers: {
                                            'User-Agent': this.config.userAgent,
                                            'Referer': 'https://www.bilibili.com/'
                                        }
                                    });

                                    if (!response.ok) {
                                        throw new Error(`HTTP ${response.status}`);
                                    }

                                    // 检查文件大小
                                    const contentLength = response.headers.get('content-length');
                                    const fileSizeMB = contentLength ? parseInt(contentLength) / 1024 / 1024 : 0;
                                    this.logInfo(`[下载] 视频大小: ${fileSizeMB.toFixed(2)}MB`);

                                    // 检查是否超过配置的最大大小
                                    const maxSize = this.config.MaximumFileSizeMB;
                                    this.logInfo(`[下载] 配置的最大大小: ${maxSize}MB`);

                                    if (maxSize > 0 && fileSizeMB > maxSize) {
                                        this.logger.warn(`[下载] 文件过大 (${fileSizeMB.toFixed(2)}MB > ${maxSize}MB)，跳过视频下载`);
                                        // 标记文件过大，后续不加入视频元素
                                        fileTooLarge = true;
                                    } else {
                                        this.logInfo(`[下载] 开始下载并转换为Base64...`);

                                        // 获取 MIME 类型
                                        const contentType = response.headers.get('content-type');
                                        const mimeType = contentType ? contentType.split(';')[0].trim() : 'video/mp4';

                                        this.logInfo(`[下载] 读取响应体...`);
                                        // 读取响应体并转换
                                        const arrayBuffer = await response.arrayBuffer();
                                        this.logInfo(`[下载] 创建Buffer...`);
                                        const buffer = Buffer.from(arrayBuffer);
                                        this.logInfo(`[下载] 转换为Base64...`);
                                        const base64Data = buffer.toString('base64');
                                        videoData = `data:${mimeType};base64,${base64Data}`;

                                        this.logInfo(`[下载] 视频下载完成，已转换为Base64`);
                                    }
                                } catch (error) {
                                    this.logger.error("下载视频失败:", error);
                                    // 出错时继续使用原始URL
                                }
                            }

                            if (fileTooLarge) {
                                // 文件过大：不发送视频，仅保留图文（textElements 已准备好）
                                // 根据 Maximumduration_tip 的逻辑决定是否追加提示语
                                if (typeof this.config.Maximumduration_tip === 'object' && this.config.Maximumduration_tip !== null) {
                                    if (this.config.Maximumduration_tip.tipcontent) {
                                        if (this.config.Maximumduration_tip.tipanalysis) {
                                            // 提示语合并到消息中
                                            videoElements.push(h.text(this.config.Maximumduration_tip.tipcontent));
                                        } else {
                                            // 单独发送提示语
                                            await session.send(this.config.Maximumduration_tip.tipcontent);
                                        }
                                    }
                                    // 根据 tipanalysis 决定是否保留图文
                                    if (!this.config.Maximumduration_tip.tipanalysis) {
                                        textElements = [];
                                    }
                                }
                                // 如果 Maximumduration_tip 为 null，则默认保留图文，不追加提示语
                            } else if (videoData) {
                                // 文件大小正常，正常发送视频/链接
                                if (options.link) {
                                    // 如果是链接选项，仍然使用原始URL
                                    videoElements.push(h.text(video.url));
                                } else if (options.audio) {
                                    videoElements.push(h.audio(videoData));
                                } else {
                                    if (this.config.videoParseComponents.includes('log')) {
                                        this.logInfo(video.url);
                                    }
                                    if (this.config.videoParseComponents.includes('link')) {
                                        videoElements.push(h.text(video.url));
                                    }
                                    if (this.config.videoParseComponents.includes('video')) {
                                        videoElements.push(h.video(videoData));
                                    }
                                }
                            } else {
                                throw new Error("解析视频直链失败");
                            }

                        }
                    } else {
                        throw new Error("获取播放数据失败");
                    }
                } else {
                    throw new Error("解析视频信息失败或非视频类型内容");
                }
            } catch (error) {
                this.logger.error("请求解析 API 失败或处理出错:", error);
            }
        }

        // 准备发送的所有元素
        let allElements = [...textElements, ...videoElements];

        if (allElements.length === 0) {
            return;
        }

        // 合并转发处理
        if (this.config.isfigure && (session.platform === "onebot" || session.platform === "red")) {
            this.logInfo(`使用合并转发，正在合并消息。`);

            // 创建 figure 元素
            const figureContent = h('figure', {
                children: allElements
            });

            if (this.config.loggerinfofulljson) {
                this.logInfo(JSON.stringify(figureContent, null, 2));
            }

            // 发送合并转发消息
            await session.send(figureContent);
        } else {
            // 没有启用合并转发，按顺序发送所有元素
            for (const element of allElements) {
                await session.send(element);
            }
        }

        this.logInfo(`机器人已发送完整消息。`);
        if (waitTipMsgId) {
            await session.bot.deleteMessage(session.channelId, waitTipMsgId);
        }
        return;
    }

    // 提取最后一个URL
    private extractLastUrl(text: string): string | null {
        const urlPattern = /https?:\/\/[^\s]+/g;
        const urls = text.match(urlPattern);
        return urls ? urls.pop() : null;
    }

    // 检测BV / AV 号并转换为URL
    public convertBVToUrl(text: string): string[] {
        const bvPattern = /(?:^|\s)(BV\w{10})(?:\s|$)/g;
        const avPattern = /(?:^|\s)(av\d+)(?:\s|$)/g;
        const matches: string[] = [];
        let match: RegExpExecArray;

        // 查找 BV 号
        while ((match = bvPattern.exec(text)) !== null) {
            matches.push(`https://www.bilibili.com/video/${match[1]}`);
        }

        // 查找 AV 号
        while ((match = avPattern.exec(text)) !== null) {
            matches.push(`https://www.bilibili.com/video/${match[1]}`);
        }

        return matches;
    }

    private numeral(number: number): string | number {
        if (this.config.useNumeral) {
            if (number >= 10000 && number < 100000000) {
                return (number / 10000).toFixed(1) + "万";
            }
            else if (number >= 100000000) {
                return (number / 100000000).toFixed(1) + "亿";
            }
            else {
                return number.toString();
            }
        }
        else {
            return number;
        }
    }

    private getVideoUrl(info: any): string {
        if (this.config.bVideoIDPreference === 'av') {
            return `https://www.bilibili.com/video/av${info.aid}`;
        }
        return `https://www.bilibili.com/video/${info.bvid}`;
    }

    private escapeHtml(value: unknown): string {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
        })[character]);
    }

    private formatDate(timestamp: number): string {
        return new Date(timestamp * 1000).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    }

    private formatDuration(duration: number): string {
        const totalSeconds = Math.max(0, Math.floor(duration));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    private async fetchDanmaku(cid: number): Promise<string[]> {
        try {
            const response = await this.ctx.http.get(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
                headers: { 'User-Agent': this.config.userAgent },
                responseType: 'text',
            });
            return Array.from(String(response).matchAll(/<d [^>]*>(.*?)<\/d>/g), (match) =>
                match[1]
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"'),
            ).filter(Boolean).slice(0, 8);
        } catch (error) {
            this.logger.warn('获取视频弹幕失败:', error);
            return [];
        }
    }

    private async fetchComments(aid: number): Promise<any[]> {
        try {
            const response: any = await this.ctx.http.get('https://api.bilibili.com/x/v2/reply/main', {
                params: { type: 1, oid: aid, next: 0, mode: 3, plat: 1 },
                headers: { 'User-Agent': this.config.userAgent },
            });
            if (response?.code !== 0) return [];
            return (response.data?.replies || []).slice(0, 5);
        } catch (error) {
            this.logger.warn('获取视频评论失败:', error);
            return [];
        }
    }

    private async renderVideoCard(info: any): Promise<Buffer> {
        const [danmaku, comments] = await Promise.all([
            this.fetchDanmaku(info.cid),
            this.fetchComments(info.aid),
        ]);
        const page = await this.ctx.puppeteer.page();
        try {
            await page.setContent(this.generateCardHtml(info, danmaku, comments), { waitUntil: 'networkidle2' });
            const card = await page.$('.card');
            if (!card) throw new Error('未找到视频卡片节点');
            return await card.screenshot({ type: 'png' }) as Buffer;
        } finally {
            await page.close();
        }
    }

    private renderCommentMessage(message: string, emotes: Record<string, { url?: string }> = {}): string {
        const names = Object.keys(emotes);
        if (names.length === 0) return this.escapeHtml(message);

        const pattern = new RegExp(`(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
        return message.split(pattern).map((part) => {
            const url = emotes[part]?.url;
            return url
                ? `<img class="emote" src="${this.escapeHtml(url)}" alt="${this.escapeHtml(part)}" />`
                : this.escapeHtml(part);
        }).join('');
    }

    private generateCardHtml(info: any, danmaku: string[], comments: any[]): string {
        const stat = info.stat || {};
        const owner = info.owner || {};
        const statItems: [string, string | number][] = [
            ['play', this.numeral(stat.view || 0)],
            ['comment', this.numeral(stat.reply || 0)],
            ['like', this.numeral(stat.like || 0)],
            ['coin', this.numeral(stat.coin || 0)],
            ['star', this.numeral(stat.favorite || 0)],
            ['share', this.numeral(stat.share || 0)],
        ];
        const stats = statItems.map(([name, value]) => `<span class="stat">${this.icon(name)} ${value}</span>`).join('');
        const danmakuHtml = danmaku.length
            ? `<section><h2>弹幕</h2><div class="danmaku">${danmaku.map((item) => `<span>${this.escapeHtml(item)}</span>`).join('')}</div></section>`
            : '';
        const commentsHtml = `<section><h2>热门评论</h2>${comments.length
            ? comments.map((comment) => {
                const level = comment.member?.level_info?.current_level;
                const levelBadge = level !== undefined && level !== null ? `<span class="level">Lv.${level}</span>` : '';
                return `
                <article class="comment">
                  <img src="${this.escapeHtml(comment.member?.avatar)}" />
                  <div>
                    <div class="comment-user">${this.escapeHtml(comment.member?.uname)}${levelBadge}</div>
                    <p>${this.renderCommentMessage(comment.content?.message || '', comment.content?.emote)}</p>
                    <small>${this.formatDate(comment.ctime)}　${this.icon('like')} ${this.numeral(comment.like || 0)}</small>
                  </div>
                </article>`;
            }).join('')
            : '<p class="empty">暂无热门评论</p>'}</section>`;

        return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; color: #18191c; }
  .card { width: 620px; overflow: hidden; border-radius: 20px; background: #fff; box-shadow: 0 8px 24px rgba(24, 25, 28, .14); }
  .cover { position: relative; aspect-ratio: 16 / 9; background: #f1f2f3; }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-meta { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: flex-end; padding: 28px 16px 12px; color: #fff; font-size: 15px; background: linear-gradient(transparent, rgba(0, 0, 0, .68)); }
  .main { padding: 22px 24px 28px; }
  h1 { margin: 0; font-size: 25px; line-height: 1.38; font-weight: 750; }
  .date { margin-top: 14px; color: #9499a0; font-size: 16px; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .stat { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; border-radius: 18px; color: #61666d; background: #f1f2f3; font-size: 15px; }
  .stat svg { display: block; flex: 0 0 16px; width: 16px; height: 16px; fill: currentColor; }
  .owner { display: flex; align-items: center; gap: 12px; margin-top: 20px; font-size: 20px; font-weight: 700; }
  .owner img, .comment img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #f1f2f3; }
  .desc { display: -webkit-box; margin-top: 20px; padding: 14px 16px; overflow: hidden; border-radius: 12px; color: #61666d; background: #f6f7f8; font-size: 16px; line-height: 1.6; white-space: pre-wrap; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  section { margin-top: 24px; }
  h2 { margin: 0 0 12px; font-size: 22px; }
  .danmaku { display: flex; flex-wrap: wrap; gap: 8px; }
  .danmaku span { padding: 8px 11px; border-radius: 8px; color: #61666d; background: #f1f2f3; font-size: 15px; }
  .comment { display: flex; gap: 12px; margin-top: 16px; }
  .comment-user { display: flex; align-items: center; gap: 6px; color: #61666d; font-size: 16px; }
  .level { padding: 2px 6px; border-radius: 4px; color: #4190d9; background: #e8f3ff; font-size: 12px; font-weight: 600; }
  .comment p { margin: 5px 0 8px; font-size: 17px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .comment p .emote { display: inline-block; width: 24px; height: 24px; object-fit: contain; vertical-align: -6px; }
  .comment small { color: #9499a0; font-size: 14px; }
  .comment small svg { display: inline-block; width: 14px; height: 14px; fill: currentColor; vertical-align: -2px; }
  .empty { margin: 0; color: #9499a0; font-size: 16px; }
</style></head><body>
<main class="card">
  <div class="cover"><img src="${this.escapeHtml(info.pic)}" /><div class="cover-meta"><span>${this.formatDuration(info.duration || 0)}</span></div></div>
  <div class="main">
    <h1>${this.escapeHtml(info.title)}</h1>
    <div class="date">${this.formatDate(info.pubdate)}</div>
    <div class="stats">${stats}</div>
    <div class="owner"><img src="${this.escapeHtml(owner.face)}" />UP主：${this.escapeHtml(owner.name)}</div>
    <div class="desc">${this.escapeHtml(info.desc || '暂无简介')}</div>
    ${danmakuHtml}
    ${commentsHtml}
  </div>
</main></body></html>`;
    }

    private icon(name: string): string {
        const icons: Record<string, string> = {
            play: '<svg viewBox="0 0 16 16"><path d="M4 3.5v9l9-4.5z"/></svg>',
            comment: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M2 11C2 6.58172 5.58172 3 10 3H14C18.4183 3 22 6.58172 22 11C22 15.2656 18.6616 18.7514 14.4549 18.9873C13.4971 20.2148 11.9228 21.7529 9.71136 22.3555C9.2837 22.472 8.89202 22.2894 8.673 22.0075C8.46064 21.7342 8.38542 21.3424 8.5439 20.9775C8.87531 20.2145 8.94851 19.5143 8.90558 18.9257C5.00479 18.3918 2 15.0471 2 11ZM10 4.5C6.41015 4.5 3.5 7.41015 3.5 11C3.5 14.459 6.20234 17.2875 9.6105 17.4885C9.95008 17.5086 10.2337 17.7547 10.3013 18.088C10.4401 18.7716 10.4842 19.6217 10.2587 20.5643C11.6947 19.9026 12.7693 18.7583 13.4679 17.806C13.6076 17.6155 13.829 17.502 14.0652 17.4997C17.6249 17.4648 20.5 14.5681 20.5 11C20.5 7.41015 17.5899 4.5 14 4.5H10Z"/></svg>',
            like: '<svg viewBox="0 0 24 24"><path d="M13.9252 3.04546C13.6432 3.01258 13.382 3.13521 13.2422 3.29868C12.9774 3.60848 12.8705 3.86276 12.7384 4.23799C12.7234 4.28037 12.7082 4.32422 12.6925 4.36961C12.5611 4.74857 12.3929 5.23391 12.044 5.85187C11.446 6.91117 10.8882 7.55173 10.2013 8.154C9.63865 8.6473 9.06639 8.98294 8.5 9.14275V19.7248C9.28689 19.7417 10.1287 19.7525 11 19.7525C13.2468 19.7525 15.1529 19.6812 16.4372 19.615C17.3477 19.5681 18.1379 19.1176 18.5497 18.3851C19.1274 17.3574 19.8396 15.8503 20.2712 14.0753C20.6734 12.4212 20.8569 11.0615 20.9392 10.1025C20.9774 9.65797 20.6256 9.25003 20.08 9.25003H15.0977C14.8476 9.25003 14.614 9.12542 14.4748 8.91775C14.3355 8.71015 14.3089 8.44684 14.4037 8.21557C14.4037 8.21555 14.4037 8.21553 14.4037 8.21551C14.4037 8.21547 14.4038 8.21543 14.4038 8.21539C14.4038 8.21537 14.4038 8.21536 14.4038 8.21534L14.4046 8.21341L14.4085 8.20377L14.4249 8.16256C14.4395 8.12573 14.4609 8.07081 14.4874 8.00089C14.5404 7.86084 14.6131 7.66185 14.6909 7.42856C14.8489 6.95439 15.0177 6.36917 15.0941 5.85681C15.2109 5.07451 15.1824 4.44592 14.8757 3.86439C14.5461 3.23954 14.1724 3.07429 13.9252 3.04546ZM16.164 7.75003H20.08C21.4037 7.75003 22.5555 8.81291 22.4337 10.2309C22.3455 11.2583 22.1508 12.6941 21.7288 14.4297C21.2555 16.3758 20.4798 18.0127 19.8573 19.1201C19.1594 20.3616 17.8654 21.0435 16.5144 21.113C15.21 21.1802 13.2777 21.2525 11 21.2525C8.7933 21.2525 6.77664 21.1846 5.34776 21.1195C3.73985 21.0461 2.39101 19.8517 2.21798 18.2152C2.1042 17.1391 2 15.7467 2 14.2525C2 12.8835 2.08746 11.6418 2.18985 10.6567C2.36874 8.93544 3.84615 7.75003 5.50754 7.75003H7.75C8.06896 7.75003 8.56382 7.59478 9.21241 7.02612C9.77509 6.53279 10.2246 6.0235 10.7378 5.11442C11.0177 4.61868 11.146 4.24973 11.2753 3.87788C11.2913 3.83198 11.3072 3.78604 11.3235 3.73981C11.4791 3.29802 11.6602 2.84083 12.1021 2.32398C12.5582 1.79047 13.3077 1.4633 14.0989 1.55555C14.9248 1.65186 15.6866 2.18668 16.2024 3.16456C16.7233 4.15177 16.5199 5.21045 16.3262 6.09633C16.2307 6.53324 16.1766 6.98591 16.164 7.75003Z"/></svg>',
            coin: '<svg viewBox="0 0 28 28"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.045 25.5454C7.69377 25.5454 2.54504 20.3967 2.54504 14.0454C2.54504 7.69413 7.69377 2.54541 14.045 2.54541C20.3963 2.54541 25.545 7.69413 25.545 14.0454C25.545 17.0954 24.3334 20.0205 22.1768 22.1771C20.0201 24.3338 17.095 25.5454 14.045 25.5454ZM9.66202 6.81624H18.2761C18.825 6.81624 19.27 7.22183 19.27 7.72216C19.27 8.22248 18.825 8.62807 18.2761 8.62807H14.95V10.2903C17.989 10.4444 20.3766 12.9487 20.3855 15.9916V17.1995C20.3854 17.6997 19.9799 18.1052 19.4796 18.1052C18.9793 18.1052 18.5738 17.6997 18.5737 17.1995V15.9916C18.5667 13.9478 16.9882 12.2535 14.95 12.1022V20.5574C14.95 21.0577 14.5444 21.4633 14.0441 21.4633C13.5437 21.4633 13.1382 21.0577 13.1382 20.5574V12.1022C11.1 12.2535 9.52148 13.9478 9.51448 15.9916V17.1995C9.5144 17.6997 9.10883 18.1052 8.60856 18.1052C8.1083 18.1052 7.70273 17.6997 7.70265 17.1995V15.9916C7.71158 12.9487 10.0992 10.4444 13.1382 10.2903V8.62807H9.66202C9.11309 8.62807 8.66809 8.22248 8.66809 7.72216C8.66809 7.22183 9.11309 6.81624 9.66202 6.81624Z"/></svg>',
            star: '<svg viewBox="0 0 28 28"><path d="M19.8071 9.26152C18.7438 9.09915 17.7624 8.36846 17.3534 7.39421L15.4723 3.4972C14.8998 2.1982 13.1004 2.1982 12.4461 3.4972L10.6468 7.39421C10.1561 8.36846 9.25639 9.09915 8.19315 9.26152L3.94016 9.91102C2.63155 10.0734 2.05904 11.6972 3.04049 12.6714L6.23023 15.9189C6.96632 16.6496 7.29348 17.705 7.1299 18.7605L6.39381 23.307C6.14844 24.6872 7.62063 25.6614 8.84745 25.0119L12.4461 23.0634C13.4276 22.4951 14.6544 22.4951 15.6359 23.0634L19.2345 25.0119C20.4614 25.6614 21.8518 24.6872 21.6882 23.307L20.8703 18.7605C20.7051 17.705 21.0339 16.6496 21.77 15.9189L24.9597 12.6714C25.9412 11.6972 25.3687 10.0734 24.06 9.91102L19.8071 9.26152Z"/></svg>',
            share: '<svg viewBox="0 0 24 24"><path d="M12.5 4.2c-.7-.5-1.7 0-1.7.9v3.4C6.2 9 3.1 12.2 2.1 17.2c-.2 1 .9 1.6 1.6.8 1.8-2.2 4.2-3.4 7.1-3.7v3.4c0 .9 1 1.4 1.7.8l8.4-6.4c.6-.5.6-1.4 0-1.9z"/></svg>',
        };
        return icons[name] || '';
    }

    /**
     * 解析 ID 类型
     * @param id 视频 ID
     * @returns type: ID 类型, id: 视频 ID
     */
    private vid_type_parse(id: string): { type: string | null; id: string | null } {
        var idRegex = [
            {
                pattern: /av([0-9]+)/i,
                type: "av",
            },
            {
                pattern: /bv([0-9a-zA-Z]+)/i,
                type: "bv",
            },
        ];
        for (const rule of idRegex) {
            var match = id.match(rule.pattern);
            if (match) {
                return {
                    type: rule.type,
                    id: match[1],
                };
            }
        }
        return {
            type: null,
            id: null,
        };
    }

    /**
     * 根据视频 ID 查找视频信息
     * @param id 视频 ID
     * @returns 视频信息 Json
     */
    private async fetch_video_info(id: string): Promise<any> {
        var ret: any;
        const vid = this.vid_type_parse(id);
        switch (vid["type"]) {
            case "av":
                ret = await this.ctx.http.get("https://api.bilibili.com/x/web-interface/view?aid=" + vid["id"], {
                    headers: {
                        "User-Agent": this.config.userAgent,
                    },
                });
                break;
            case "bv":
                ret = await this.ctx.http.get("https://api.bilibili.com/x/web-interface/view?bvid=" + vid["id"], {
                    headers: {
                        "User-Agent": this.config.userAgent,
                    },
                });
                break;
            default:
                ret = null;
                break;
        }
        return ret;
    }

    /**
     * 生成视频链接
     * @param id 视频 ID
     * @returns 视频链接
     */
    private async gen_context(id: string): Promise<string | null> {
        const info = await this.fetch_video_info(id);
        if (!info || !info["data"])
            return null;

        return this.getVideoUrl(info.data);
    }

    /**
    * 链接类型解析
    * @param content 传入消息
    * @returns type: "链接类型", id :"内容ID"
    */
    private link_type_parser(content: string): { type: string; id: string }[] {
        // 先替换转义斜杠
        content = content.replace(/\\\//g, '/');
        var linkRegex = [
            {
                pattern: /bilibili\.com\/video\/([ab]v[0-9a-zA-Z]+)/gim,
                type: "Video",
            },
            {
                pattern: /b23\.tv(?:\\)?\/([0-9a-zA-Z]+)/gim,
                type: "Short",
            },
            {
                pattern: /bili(?:22|23|33)\.cn\/([0-9a-zA-Z]+)/gim,
                type: "Short",
            },
            {
                pattern: /bili2233\.cn\/([0-9a-zA-Z]+)/gim,
                type: "Short",
            },
        ];
        var ret: { type: string; id: string }[] = [];
        for (const rule of linkRegex) {
            var match: RegExpExecArray;
            let lastID: string;
            while ((match = rule.pattern.exec(content)) !== null) {
                if (lastID == match[1])
                    continue;
                ret.push({
                    type: rule.type,
                    id: match[1],
                });
                lastID = match[1];
            }
        }
        return ret;
    }

    /**
    * 类型执行器
    * @param element 链接列表
    * @returns 解析来的文本
    */
    private async type_processer(element: { type: string; id: string }): Promise<string> {
        var ret = "";
        switch (element["type"]) {
            case "Video":
                const video_info = await this.gen_context(element["id"]);
                if (video_info != null)
                    ret += video_info;
                break;

            case "Short":
                const typed_link = this.link_type_parser(await this.get_redir_url(element["id"]));
                for (const element of typed_link) {
                    const final_info = await this.type_processer(element);
                    if (final_info != null)
                        ret += final_info;
                    break;
                }
                break;
        }
        return ret;
    }

    /**
    * 根据短链接重定向获取正常链接
    * @param id 短链接 ID
    * @returns 正常链接
    */
    private async get_redir_url(id: string): Promise<string | null> {
        var data = await this.ctx.http.get("https://b23.tv/" + id, {
            redirect: "manual",
            headers: {
                "User-Agent": this.config.userAgent,
            },
        });
        const match = data.match(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"/i);
        if (match)
            return match[1];
        else
            return null;
    }
}
