import { Schema, Context } from "koishi";
export declare const name = "bilibili-videolink-analysis-fork";
export declare const inject: {
    optional: string[];
};
export declare const usage = "\n\n<h2>\u2192 <a href=\"https://www.npmjs.com/package/koishi-plugin-bilibili-videolink-analysis-fork\" target=\"_blank\">\u53EF\u4EE5\u70B9\u51FB\u8FD9\u91CC\u67E5\u770B\u8BE6\u7EC6\u7684\u6587\u6863\u8BF4\u660E\u2728</a></h2>\n\n\u2728 \u53EA\u9700\u5F00\u542F\u63D2\u4EF6\uFF0C\u5C31\u53EF\u4EE5\u89E3\u6790B\u7AD9\u89C6\u9891\u7684\u94FE\u63A5\u5566~ \u2728\n\n\u5411bot\u53D1\u9001B\u7AD9\u89C6\u9891\u94FE\u63A5\u5427~\n\n\u4F1A\u8FD4\u56DE\u89C6\u9891\u4FE1\u606F\u4E0E\u89C6\u9891\u54E6\n\n---\n\n#### \u26A0\uFE0F **\u5982\u679C\u4F60\u4F7F\u7528\u4E0D\u4E86\u672C\u9879\u76EE\uFF0C\u8BF7\u4F18\u5148\u68C0\u67E5\uFF1A** \u26A0\uFE0F\n####   \u82E5\u65E0\u6CE8\u518C\u7684\u6307\u4EE4\uFF0C\u8BF7\u5173\u5F00\u4E00\u4E0B[command\u63D2\u4EF6](/market?keyword=commands+email:shigma10826@gmail.com)\uFF08\u6CA1\u6709\u6307\u4EE4\u4E5F\u4E0D\u5F71\u54CD\u89E3\u6790\u522B\u4EBA\u7684\u94FE\u63A5\uFF09\n####   \u89C6\u9891\u5185\u5BB9\u662F\u5426\u4E3AB\u7AD9\u7684\u5927\u4F1A\u5458\u4E13\u5C5E\u89C6\u9891/\u4ED8\u8D39\u89C6\u9891/\u5145\u7535\u4E13\u5C5E\u89C6\u9891\n####   \u63A5\u5165\u65B9\u6CD5\u662F\u5426\u652F\u6301\u83B7\u53D6\u7F51\u5740\u94FE\u63A5/\u5C0F\u7A0B\u5E8F\u5361\u7247\u6D88\u606F\n####   \u63A5\u5165\u65B9\u6CD5\u662F\u5426\u652F\u6301\u89C6\u9891\u5143\u7D20\u7684\u53D1\u9001\n####   \u53D1\u9001\u89C6\u9891\u8D85\u65F6/\u5176\u4ED6\u7F51\u7EDC\u95EE\u9898\n####   \u89C6\u9891\u5185\u5BB9\u88AB\u5E73\u53F0\u5C4F\u853D/\u5176\u4ED6\u5E73\u53F0\u56E0\u7D20\n\n---\n\n### \u56FE\u6587\u5361\u7247\u529F\u80FD\u9700\u8981\u4F7F\u7528 puppeteer \u670D\u52A1\n\n\n---\n\n### \u7279\u522B\u9E23\u8C22 \uD83D\uDC96\n\n\u7279\u522B\u9E23\u8C22\u4EE5\u4E0B\u9879\u76EE\u7684\u652F\u6301\uFF1A\n\n- [@summonhim/koishi-plugin-bili-parser](/market?keyword=bili-parser)\n\n---\n\n";
export interface Config {
    enablebilianalysis: boolean;
    videoParseMode: string[];
    waitTip_Switch?: string | null;
    videoParseComponents: string[];
    BVnumberParsing: boolean;
    MinimumTimeInterval: number;
    Minimumduration: number;
    Minimumduration_tip: 'return' | {
        tipcontent: string;
        tipanalysis: boolean;
    } | null;
    Maximumduration: number;
    Maximumduration_tip: 'return' | {
        tipcontent: string;
        tipanalysis: boolean;
    } | null;
    parseLimit: number;
    useNumeral: boolean;
    showError: boolean;
    bVideoIDPreference: "bv" | "av";
    bVideoShowLink: boolean;
    isfigure: boolean;
    filebuffer: boolean;
    MaximumFileSizeMB: number;
    middleware: boolean;
    userAgent: string;
    loggerinfo: boolean;
    loggerinfofulljson: boolean;
    bufferDelay: number;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enablebilianalysis: Schema<boolean, boolean>;
}> | Schemastery.ObjectS<{
    loggerinfo: Schema<boolean, boolean>;
    loggerinfofulljson: Schema<boolean, boolean>;
}> | Schemastery.ObjectS<{
    MinimumTimeInterval: Schema<number, number>;
    Minimumduration: Schema<number, number>;
    Minimumduration_tip: Schema<"return" | Schemastery.ObjectS<{
        tipcontent: Schema<string, string>;
        tipanalysis: Schema<boolean, boolean>;
    }>, "return" | Schemastery.ObjectT<{
        tipcontent: Schema<string, string>;
        tipanalysis: Schema<boolean, boolean>;
    }>>;
    Maximumduration: Schema<number, number>;
    Maximumduration_tip: Schema<"return" | Schemastery.ObjectS<{
        tipcontent: Schema<string, string>;
        tipanalysis: Schema<boolean, boolean>;
    }>, "return" | Schemastery.ObjectT<{
        tipcontent: Schema<string, string>;
        tipanalysis: Schema<boolean, boolean>;
    }>>;
    MaximumFileSizeMB: Schema<number, number>;
}> | Schemastery.ObjectS<{
    bVideoShowLink: Schema<boolean, boolean>;
}> | Schemastery.ObjectS<{
    isfigure: Schema<boolean, boolean>;
    filebuffer: Schema<boolean, boolean>;
    bufferDelay: Schema<number, number>;
    middleware: Schema<boolean, boolean>;
}> | Schemastery.ObjectS<{
    userAgent: Schema<string, string>;
}> | Schemastery.ObjectS<{
    parseLimit: Schema<number, number>;
    useNumeral: Schema<boolean, boolean>;
    showError: Schema<boolean, boolean>;
    bVideoIDPreference: Schema<"bv" | "av", "bv" | "av">;
}>, {
    enablebilianalysis: boolean;
} & import("cosmokit").Dict & ({
    loggerinfo: boolean;
    loggerinfofulljson: boolean;
} & (Schemastery.ObjectT<{
    enablebilianalysis: Schema<false, false>;
}> | ({
    enablebilianalysis: true;
    waitTip_Switch: any;
    videoParseMode: ("link" | "card")[];
    videoParseComponents: ("link" | "text" | "video" | "log")[];
    BVnumberParsing: boolean;
} & import("cosmokit").Dict & {
    MinimumTimeInterval: number;
    Minimumduration: number;
    Minimumduration_tip: "return" | Schemastery.ObjectT<{
        tipcontent: Schema<string, string>;
        tipanalysis: Schema<boolean, boolean>;
    }>;
    Maximumduration: number;
    Maximumduration_tip: "return" | Schemastery.ObjectT<{
        tipcontent: Schema<string, string>;
        tipanalysis: Schema<boolean, boolean>;
    }>;
    MaximumFileSizeMB: number;
} & {
    bVideoShowLink: boolean;
} & {
    isfigure: boolean;
    filebuffer: boolean;
    bufferDelay: number;
    middleware: boolean;
} & {
    userAgent: string;
} & {
    parseLimit: number;
    useNumeral: boolean;
    showError: boolean;
    bVideoIDPreference: "bv" | "av";
})))>;
export declare function apply(ctx: Context, config: Config): void;
