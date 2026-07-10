"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.usage = exports.inject = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const utils_1 = require("./utils");
const logger = new koishi_1.Logger('bilibili-videolink-card');
exports.name = 'bilibili-videolink-card';
exports.inject = {
    optional: ['puppeteer'],
};
exports.usage = `
`;
exports.Config = koishi_1.Schema.intersect([
    // 解析功能总开关
    koishi_1.Schema.object({
        enablebilianalysis: koishi_1.Schema.boolean().default(true).description("开启解析功能<br>`关闭后，解析功能将关闭`"),
    }).description('视频解析 - 功能开关'),
    koishi_1.Schema.union([
        koishi_1.Schema.object({
            enablebilianalysis: koishi_1.Schema.const(false).required(),
        }),
        koishi_1.Schema.intersect([
            // 基础解析设置
            koishi_1.Schema.object({
                enablebilianalysis: koishi_1.Schema.const(true),
                waitTip_Switch: koishi_1.Schema.union([
                    koishi_1.Schema.const(null).description('不返回文字提示'),
                    koishi_1.Schema.string().description('返回文字提示（请在右侧填写文字内容）').default('正在解析B站链接...'),
                ]).description("是否返回等待提示。开启后，会发送`等待提示语`"),
                videoParseMode: koishi_1.Schema.array(koishi_1.Schema.union([
                    koishi_1.Schema.const('link').description('解析链接'),
                    koishi_1.Schema.const('card').description('解析哔哩哔哩分享卡片'),
                ]))
                    .default(['link', 'card'])
                    .role('checkbox')
                    .description('选择解析来源'),
                videoParseComponents: koishi_1.Schema.array(koishi_1.Schema.union([
                    koishi_1.Schema.const('log').description('记录日志'),
                    koishi_1.Schema.const('text').description('返回图文'),
                    koishi_1.Schema.const('link').description('返回视频直链'),
                    koishi_1.Schema.const('video').description('返回视频'),
                ]))
                    .default(['text', 'video'])
                    .role('checkbox')
                    .description('选择要返回的内容组件'),
                BVnumberParsing: koishi_1.Schema.boolean().default(true).description("是否允许根据`独立的BV、AV号`解析视频 `开启后，可以通过视频的BV、AV号解析视频。` <br>  [触发说明见README](https://www.npmjs.com/package/koishi-plugin-bilibili-videolink-card)"),
            }).description('基础解析设置'),
            // 视频过滤规则
            koishi_1.Schema.object({
                MinimumTimeInterval: koishi_1.Schema.number().default(180).description("若干`秒`内 不再处理相同链接 `防止多bot互相触发 导致的刷屏/性能浪费`").min(1),
                Minimumduration: koishi_1.Schema.number().default(0).description("允许解析的视频最小时长（分钟）`低于这个时长 就不会发视频内容`").min(0),
                Minimumduration_tip: koishi_1.Schema.union([
                    koishi_1.Schema.const('return').description('不返回文字提示'),
                    koishi_1.Schema.object({
                        tipcontent: koishi_1.Schema.string().default('视频太短啦！不看不看~').description("文字提示内容"),
                        tipanalysis: koishi_1.Schema.boolean().default(true).description("是否进行图文解析（不会返回视频链接）"),
                    }).description('返回文字提示'),
                ]).description("对`过短视频`的文字提示内容").default(null),
                Maximumduration: koishi_1.Schema.number().default(25).description("允许解析的视频最大时长（分钟）`超过这个时长 就不会发视频内容`").min(1),
                Maximumduration_tip: koishi_1.Schema.union([
                    koishi_1.Schema.const('return').description('不返回文字提示'),
                    koishi_1.Schema.object({
                        tipcontent: koishi_1.Schema.string().default('视频太长啦！内容还是去B站看吧~').description("文字提示内容"),
                        tipanalysis: koishi_1.Schema.boolean().default(true).description("是否进行图文解析（不会返回视频链接）"),
                    }).description('返回文字提示'),
                ]).description("对`过长视频`的文字提示内容").default(null),
                MaximumFileSizeMB: koishi_1.Schema.number().default(50).description("文件缓冲最大大小（MB）`超过这个大小 就不会发视频内容`<br>设置为0 表示不限制").min(0).max(200),
            }).description('视频过滤规则'),
            // 图文解析设置
            koishi_1.Schema.object({
                bVideoShowLink: koishi_1.Schema.boolean().default(false).description("在末尾显示视频的链接地址 `开启可能会导致其他bot循环解析`"),
            }).description('图文解析设置'),
            // 高级功能设置
            koishi_1.Schema.object({
                isfigure: koishi_1.Schema.boolean().default(false).description("是否开启合并转发 `仅支持 onebot 适配器` 其他平台开启 无效").experimental(),
                filebuffer: koishi_1.Schema.boolean().default(true).description("是否将视频链接下载后再发送 （以解决部分onebot协议端的问题）<br>否则使用视频直链发送").experimental(),
                bufferDelay: koishi_1.Schema.number().default(5).description("消息接收缓冲延迟（秒）<br>收到链接后等待指定时间，收集同时发送的多个链接后再逐个处理").min(0).max(30),
                middleware: koishi_1.Schema.boolean().default(false).description("前置中间件模式"),
            }).description('高级功能设置'),
            // 网络请求设置
            koishi_1.Schema.object({
                userAgent: koishi_1.Schema.string().description("所有 API 请求所用的 User-Agent").default("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
            }).description('网络请求设置'),
            // 隐藏配置项
            koishi_1.Schema.object({
                parseLimit: koishi_1.Schema.number().default(3).description("单对话多链接解析上限").hidden(),
                useNumeral: koishi_1.Schema.boolean().default(true).description("使用格式化数字").hidden(),
                showError: koishi_1.Schema.boolean().default(false).description("当链接不正确时提醒发送者").hidden(),
                bVideoIDPreference: koishi_1.Schema.union([
                    koishi_1.Schema.const("bv").description("BV 号"),
                    koishi_1.Schema.const("av").description("AV 号"),
                ]).default("bv").description("ID 偏好").hidden(),
            }), // .description('其他设置')
        ]),
    ]),
    // 开发者选项
    koishi_1.Schema.object({
        loggerinfo: koishi_1.Schema.boolean().default(false).description("日志调试输出 `日常使用无需开启`<br>非开发者请勿改动").experimental(),
        loggerinfofulljson: koishi_1.Schema.boolean().default(false).description("打印完整的机器人发送的json输出").experimental(),
    }).description("开发者选项"),
]);
function apply(ctx, config) {
    const bilibiliParser = new utils_1.BilibiliParser(ctx, config, logger);
    if (config.enablebilianalysis) {
        ctx.middleware(async (session, next) => {
            // 尝试解析JSON卡片
            let isCard = false;
            try {
                if (session.stripped.content.startsWith('<json data=')) {
                    isCard = true;
                }
            }
            catch (e) {
                // Not a valid JSON card
            }
            if (isCard) {
                if (!config.videoParseMode.includes('card')) {
                    return next();
                }
            }
            else {
                if (!config.videoParseMode.includes('link')) {
                    return next();
                }
            }
            let sessioncontent = session.stripped.content;
            if (config.BVnumberParsing) {
                const bvUrls = bilibiliParser.convertBVToUrl(sessioncontent);
                if (bvUrls.length > 0) {
                    sessioncontent += '\n' + bvUrls.join('\n');
                }
            }
            const links = await bilibiliParser.isProcessLinks(sessioncontent);
            if (links) {
                // 直接将整个 session 加入队列，在队列中串行处理
                await bilibiliParser.queueSession(session, sessioncontent);
            }
            return next();
        }, config.middleware);
    }
}
