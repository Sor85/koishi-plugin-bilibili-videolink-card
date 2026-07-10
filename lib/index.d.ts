import { Schema, Context } from "koishi";
export declare const name = "bilibili-videolink-analysis-fork";
export declare const inject: {
    optional: string[];
};
export declare const usage = "\n";
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
