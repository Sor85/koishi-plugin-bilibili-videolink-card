"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BilibiliParser = void 0;
const koishi_1 = require("koishi");
class BilibiliParser {
    constructor(ctx, config, logger) {
        this.ctx = ctx;
        this.config = config;
        this.logger = logger;
        this.lastProcessedUrls = {};
        this.processingQueue = []; // 待处理队列
        this.isProcessing = false; // 是否正在处理
        this.bufferQueue = []; // 缓冲队列
        this.bufferTimer = null; // 缓冲定时器
        // Session 级别的队列控制
        this.sessionQueue = []; // Session 缓冲队列
        this.sessionTimer = null; // Session 缓冲定时器
        this.isProcessingSession = false; // 是否正在处理 Session
    }
    logInfo(...args) {
        if (this.config.loggerinfo) {
            this.logger.info(...args);
        }
    }
    //  判断是否需要解析
    async isProcessLinks(sessioncontent) {
        // 解析内容中的链接
        const links = this.link_type_parser(sessioncontent);
        if (links.length === 0) {
            return false; // 如果没有找到链接，返回 false
        }
        return links; // 返回解析出的链接
    }
    //提取链接
    async extractLinks(session, links) {
        let ret = "";
        if (!this.config.isfigure) {
            ret += (0, koishi_1.h)("quote", { id: session.messageId });
        }
        let countLink = 0;
        let tp_ret;
        // 循环检测链接类型
        for (const element of links) {
            if (countLink >= 1)
                ret += "\n";
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
            }
            else {
                ret += tp_ret;
            }
            countLink++;
        }
        return ret;
    }
    //判断链接是否已经处理过
    isLinkProcessedRecently(ret, channelId) {
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
    async queueSession(session, sessioncontent) {
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
    flushSessionBuffer() {
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
    async processSessionQueue() {
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
            }
            catch (error) {
                this.logger.error('处理Session任务时发生错误:', error);
            }
        }
        this.isProcessingSession = false;
        this.logInfo('Session队列处理完成');
    }
    // 实际处理单个 session 任务
    async processSessionTask(session, sessioncontent) {
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
            }
            else {
                this.logInfo(`[队列] 链接已处理过，跳过`);
            }
        }
        this.logInfo(`[队列] Session 处理完成`);
    }
    // 添加任务到缓冲区（已废弃，保留兼容性）
    async processVideoFromLink(session, ret, options = { video: true }) {
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
    flushBuffer() {
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
    async processQueue() {
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
            }
            catch (error) {
                this.logger.error('处理视频任务时发生错误:', error);
            }
        }
        this.isProcessing = false;
        this.logInfo('队列处理完成');
    }
    // 实际处理单个视频任务
    async processVideoTask(session, ret, options = { video: true }) {
        const lastretUrl = this.extractLastUrl(ret);
        this.logInfo(`处理视频: ${lastretUrl}`);
        let waitTipMsgId = null;
        // 等待提示语单独发送
        if (this.config.waitTip_Switch) {
            const result = await session.send(`${koishi_1.h.quote(session.messageId)}${this.config.waitTip_Switch}`);
            waitTipMsgId = Array.isArray(result) ? result[0] : result;
        }
        let videoElements = []; // 用于存储视频相关元素
        let textElements = []; // 用于存储图文解析元素
        let shouldPerformTextParsing = this.config.videoParseComponents.includes('text');
        // 先进行图文解析
        if (shouldPerformTextParsing && lastretUrl && this.ctx.puppeteer) {
            const videoLink = this.link_type_parser(lastretUrl).find((link) => link.type === 'Video');
            if (videoLink) {
                try {
                    const info = await this.fetch_video_info(videoLink.id);
                    if (info?.data) {
                        const image = await this.renderVideoCard(info.data);
                        const elements = [koishi_1.h.image(image, 'image/png')];
                        if (this.config.bVideoShowLink) {
                            elements.push(koishi_1.h.text(this.getVideoUrl(info.data)));
                        }
                        textElements.push((0, koishi_1.h)('message', {
                            userId: session.userId,
                            nickname: session.author?.nickname || session.username,
                        }, elements));
                    }
                }
                catch (error) {
                    this.logger.warn('生成视频图文卡片失败:', error);
                }
            }
        }
        else if (shouldPerformTextParsing && lastretUrl) {
            this.logger.warn('图文卡片需要 puppeteer 服务，已跳过图文解析');
        }
        // 视频/链接解析
        if (this.config.videoParseComponents.length > 0) {
            const fullAPIurl = `http://api.xingzhige.com/API/b_parse/?url=${encodeURIComponent(lastretUrl)}`;
            try {
                const responseData = await this.ctx.http.get(fullAPIurl);
                if (responseData.code === 0 && responseData.msg === "video" && responseData.data) {
                    const { bvid, cid, video } = responseData.data;
                    const bilibiliUrl = `https://api.bilibili.com/x/player/playurl?fnval=80&cid=${cid}&bvid=${bvid}`;
                    const playData = await this.ctx.http.get(bilibiliUrl);
                    if (playData.code === 0 && playData.data && playData.data.dash && playData.data.dash.duration) {
                        const videoDurationSeconds = playData.data.dash.duration;
                        const videoDurationMinutes = videoDurationSeconds / 60;
                        // 检查视频是否太短
                        if (videoDurationMinutes < this.config.Minimumduration) {
                            // 根据 Minimumduration_tip 的值决定行为
                            if (this.config.Minimumduration_tip === 'return') {
                                // 不返回文字提示，直接返回
                                return;
                            }
                            else if (typeof this.config.Minimumduration_tip === 'object' && this.config.Minimumduration_tip !== null) {
                                // 返回文字提示
                                if (this.config.Minimumduration_tip.tipcontent) {
                                    if (this.config.Minimumduration_tip.tipanalysis) {
                                        videoElements.push(koishi_1.h.text(this.config.Minimumduration_tip.tipcontent));
                                    }
                                    else {
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
                            }
                            else if (typeof this.config.Maximumduration_tip === 'object' && this.config.Maximumduration_tip !== null) {
                                // 返回文字提示
                                if (this.config.Maximumduration_tip.tipcontent) {
                                    if (this.config.Maximumduration_tip.tipanalysis) {
                                        videoElements.push(koishi_1.h.text(this.config.Maximumduration_tip.tipcontent));
                                    }
                                    else {
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
                        }
                        else {
                            // 视频时长在允许范围内，处理视频
                            let videoData = video.url; // 初始为原始 URL
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
                                    }
                                    else {
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
                                }
                                catch (error) {
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
                                            videoElements.push(koishi_1.h.text(this.config.Maximumduration_tip.tipcontent));
                                        }
                                        else {
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
                            }
                            else if (videoData) {
                                // 文件大小正常，正常发送视频/链接
                                if (options.link) {
                                    // 如果是链接选项，仍然使用原始URL
                                    videoElements.push(koishi_1.h.text(video.url));
                                }
                                else if (options.audio) {
                                    videoElements.push(koishi_1.h.audio(videoData));
                                }
                                else {
                                    if (this.config.videoParseComponents.includes('log')) {
                                        this.logInfo(video.url);
                                    }
                                    if (this.config.videoParseComponents.includes('link')) {
                                        videoElements.push(koishi_1.h.text(video.url));
                                    }
                                    if (this.config.videoParseComponents.includes('video')) {
                                        videoElements.push(koishi_1.h.video(videoData));
                                    }
                                }
                            }
                            else {
                                throw new Error("解析视频直链失败");
                            }
                        }
                    }
                    else {
                        throw new Error("获取播放数据失败");
                    }
                }
                else {
                    throw new Error("解析视频信息失败或非视频类型内容");
                }
            }
            catch (error) {
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
            const figureContent = (0, koishi_1.h)('figure', {
                children: allElements
            });
            if (this.config.loggerinfofulljson) {
                this.logInfo(JSON.stringify(figureContent, null, 2));
            }
            // 发送合并转发消息
            await session.send(figureContent);
        }
        else {
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
    extractLastUrl(text) {
        const urlPattern = /https?:\/\/[^\s]+/g;
        const urls = text.match(urlPattern);
        return urls ? urls.pop() : null;
    }
    // 检测BV / AV 号并转换为URL
    convertBVToUrl(text) {
        const bvPattern = /(?:^|\s)(BV\w{10})(?:\s|$)/g;
        const avPattern = /(?:^|\s)(av\d+)(?:\s|$)/g;
        const matches = [];
        let match;
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
    numeral(number) {
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
    getVideoUrl(info) {
        if (this.config.bVideoIDPreference === 'av') {
            return `https://www.bilibili.com/video/av${info.aid}`;
        }
        return `https://www.bilibili.com/video/${info.bvid}`;
    }
    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
        })[character]);
    }
    formatDate(timestamp) {
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
    formatDuration(duration) {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
    async fetchDanmaku(cid) {
        try {
            const response = await this.ctx.http.get(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
                headers: { 'User-Agent': this.config.userAgent },
                responseType: 'text',
            });
            return Array.from(String(response).matchAll(/<d [^>]*>(.*?)<\/d>/g), (match) => match[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')).filter(Boolean).slice(0, 8);
        }
        catch (error) {
            this.logger.warn('获取视频弹幕失败:', error);
            return [];
        }
    }
    async fetchComments(aid) {
        try {
            const response = await this.ctx.http.get('https://api.bilibili.com/x/v2/reply/main', {
                params: { type: 1, oid: aid, next: 0, mode: 3, plat: 1 },
                headers: { 'User-Agent': this.config.userAgent },
            });
            if (response?.code !== 0)
                return [];
            return (response.data?.replies || []).slice(0, 5);
        }
        catch (error) {
            this.logger.warn('获取视频评论失败:', error);
            return [];
        }
    }
    async renderVideoCard(info) {
        const [danmaku, comments] = await Promise.all([
            this.fetchDanmaku(info.cid),
            this.fetchComments(info.aid),
        ]);
        const page = await this.ctx.puppeteer.page();
        try {
            await page.setContent(this.generateCardHtml(info, danmaku, comments), { waitUntil: 'networkidle2' });
            const card = await page.$('.card');
            if (!card)
                throw new Error('未找到视频卡片节点');
            return await card.screenshot({ type: 'png' });
        }
        finally {
            await page.close();
        }
    }
    generateCardHtml(info, danmaku, comments) {
        const stat = info.stat || {};
        const owner = info.owner || {};
        const statItems = [
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
            ? comments.map((comment) => `
                <article class="comment">
                  <img src="${this.escapeHtml(comment.member?.avatar)}" />
                  <div>
                    <div class="comment-user">${this.escapeHtml(comment.member?.uname)}</div>
                    <p>${this.escapeHtml(comment.content?.message)}</p>
                    <small>${this.formatDate(comment.ctime)}　${this.icon('like')} ${this.numeral(comment.like || 0)}</small>
                  </div>
                </article>`).join('')
            : '<p class="empty">暂无热门评论</p>'}</section>`;
        return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; color: #18191c; }
  .card { width: 620px; overflow: hidden; border-radius: 20px; background: #fff; box-shadow: 0 8px 24px rgba(24, 25, 28, .14); }
  .brand { padding: 18px 24px; background: #fb7299; color: #fff; font-size: 25px; font-weight: 800; }
  .cover { position: relative; aspect-ratio: 16 / 9; background: #f1f2f3; }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-meta { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; padding: 28px 16px 12px; color: #fff; font-size: 15px; background: linear-gradient(transparent, rgba(0, 0, 0, .68)); }
  .main { padding: 22px 24px 28px; }
  h1 { margin: 0; font-size: 25px; line-height: 1.38; font-weight: 750; }
  .date { margin-top: 14px; color: #9499a0; font-size: 16px; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .stat { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; border-radius: 18px; color: #61666d; background: #f1f2f3; font-size: 15px; }
  svg { width: 16px; height: 16px; fill: currentColor; vertical-align: -3px; }
  .owner { display: flex; align-items: center; gap: 12px; margin-top: 20px; font-size: 20px; font-weight: 700; }
  .owner img, .comment img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #f1f2f3; }
  .desc { display: -webkit-box; margin-top: 20px; padding: 14px 16px; overflow: hidden; border-radius: 12px; color: #61666d; background: #f6f7f8; font-size: 16px; line-height: 1.6; white-space: pre-wrap; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  section { margin-top: 24px; }
  h2 { margin: 0 0 12px; font-size: 22px; }
  .danmaku { display: flex; flex-wrap: wrap; gap: 8px; }
  .danmaku span { padding: 8px 11px; border-radius: 8px; color: #61666d; background: #f1f2f3; font-size: 15px; }
  .comment { display: flex; gap: 12px; margin-top: 16px; }
  .comment-user { color: #61666d; font-size: 16px; }
  .comment p { margin: 5px 0 8px; font-size: 17px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .comment small { color: #9499a0; font-size: 14px; }
  .empty { margin: 0; color: #9499a0; font-size: 16px; }
</style></head><body>
<main class="card">
  <header class="brand">哔哩哔哩</header>
  <div class="cover"><img src="${this.escapeHtml(info.pic)}" /><div class="cover-meta"><span>${this.icon('play')} ${this.numeral(stat.view || 0)}　${this.icon('comment')} ${this.numeral(stat.danmaku || 0)}</span><span>${this.formatDuration(info.duration || 0)}</span></div></div>
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
    icon(name) {
        const paths = {
            play: '<path d="M4 3.5v9l9-4.5z"/>',
            comment: '<path d="M3 3h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 4h6v1H5V7zm0 3h4v1H5v-1z"/>',
            like: '<path d="M6.5 14H4V7h2.5l2-4 1 1v3h3.4c.8 0 1.3.7 1.1 1.5L12 14H6.5z"/>',
            coin: '<circle cx="8" cy="8" r="5.5"/><path fill="#fff" d="M7.4 4.8h1.2v2.6h1.7v1.1H8.6v2.7H7.4V8.5H5.7V7.4h1.7z"/>',
            star: '<path d="m8 2 1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.4l-3.6 1.9.7-4.1-3-2.9 4.1-.6z"/>',
            share: '<path d="M11 3 15 7l-4 4V8.5H7a4 4 0 0 0-4 4V11a5.5 5.5 0 0 1 5.5-5.5H11z"/>',
        };
        return `<svg viewBox="0 0 16 16" aria-hidden="true">${paths[name] || ''}</svg>`;
    }
    /**
     * 解析 ID 类型
     * @param id 视频 ID
     * @returns type: ID 类型, id: 视频 ID
     */
    vid_type_parse(id) {
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
    async fetch_video_info(id) {
        var ret;
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
    async gen_context(id) {
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
    link_type_parser(content) {
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
        var ret = [];
        for (const rule of linkRegex) {
            var match;
            let lastID;
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
    async type_processer(element) {
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
    async get_redir_url(id) {
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
exports.BilibiliParser = BilibiliParser;
