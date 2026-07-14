import { Logger, Context, Session } from "koishi";
import type { Config } from './index';
export declare class BilibiliParser {
    private ctx;
    private config;
    private logger;
    private cardRenderer?;
    private lastProcessedUrls;
    private processingQueue;
    private isProcessing;
    private bufferQueue;
    private bufferTimer;
    private sessionQueue;
    private sessionTimer;
    private isProcessingSession;
    constructor(ctx: Context, config: Config, logger: Logger);
    logInfo(...args: any[]): void;
    isProcessLinks(sessioncontent: string): Promise<false | {
        type: string;
        id: string;
    }[]>;
    extractLinks(session: Session, links: {
        type: string;
        id: string;
    }[]): Promise<string>;
    isLinkProcessedRecently(ret: string, channelId: string): boolean;
    queueSession(session: Session, sessioncontent: string): Promise<void>;
    private flushSessionBuffer;
    private processSessionQueue;
    private processSessionTask;
    processVideoFromLink(session: Session, ret: string, options?: {
        video?: boolean;
        audio?: boolean;
        link?: boolean;
    }): Promise<void>;
    private flushBuffer;
    private processQueue;
    private processVideoTask;
    private extractLastUrl;
    convertBVToUrl(text: string): string[];
    private numeral;
    private getVideoUrl;
    private escapeHtml;
    private formatDate;
    private formatDuration;
    private fetchDanmaku;
    private fetchComments;
    private fetchTags;
    private fetchOnline;
    private renderVideoCard;
    private getCardRenderer;
    private fetchCardResources;
    private renderCommentMessage;
    private generateCardHtml;
    private icon;
    /**
     * 解析 ID 类型
     * @param id 视频 ID
     * @returns type: ID 类型, id: 视频 ID
     */
    private vid_type_parse;
    /**
     * 根据视频 ID 查找视频信息
     * @param id 视频 ID
     * @returns 视频信息 Json
     */
    private fetch_video_info;
    /**
     * 生成视频链接
     * @param id 视频 ID
     * @returns 视频链接
     */
    private gen_context;
    /**
    * 链接类型解析
    * @param content 传入消息
    * @returns type: "链接类型", id :"内容ID"
    */
    private link_type_parser;
    /**
    * 类型执行器
    * @param element 链接列表
    * @returns 解析来的文本
    */
    private type_processer;
    /**
    * 根据短链接重定向获取正常链接
    * @param id 短链接 ID
    * @returns 正常链接
    */
    private get_redir_url;
}
