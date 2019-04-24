/// <reference types="webassembly-js-api" />
export type TDspMeta = {
    name: string,
    filename: string,
    compile_options: string,
    include_pathnames: string[],
    inputs: string;
    outputs: string;
    size: string,
    version: string,
    library_list: string[],
    meta: { [key: string]: string }[],
    ui: TFaustUI
};
export type TFaustUI = TFaustUIGroup[];
export type TFaustUIItem = TFaustUIInputItem | TFaustUIOutputItem | TFaustUIGroup;
export type TFaustUIInputItem = {
    type: TFaustUIInputType,
    label: string,
    address: string,
    index: string,
    init?: string,
    min?: string,
    max?: string,
    step?: string,
    meta?: any[]
};
export type TFaustUIOutputItem = {
    type: TFaustUIOutputType,
    label: string,
    address: string,
    index: string,
    min?: string,
    max?: string,
};
export type TFaustUIGroupType = "vgroup" | "hgroup" | "tgroup";
export type TFaustUIOutputType = "hbargraph" | "vbargraph";
export type TFaustUIInputType = "vslider" | "hslider" | "button" | "checkbox" | "nentry";
export type TFaustUIGroup = {
    type: TFaustUIGroupType,
    label: string,
    items: TFaustUIItem[]
}
export type TFaustUIType = TFaustUIGroupType | TFaustUIOutputType | TFaustUIInputType;
export type TCompiledCode = { ui8Code: Uint8Array, code: string, helpersCode: string };
export type TCompiledStrCode = { strCode: string, code: string, helpersCode: string };
export type TCompiledCodes = { dsp: TCompiledCode, effect?: TCompiledCode};
export type TCompiledStrCodes = { dsp: TCompiledStrCode, effect?: TCompiledStrCode};
export type THelpers = { json: string, base64Code: string, meta: TDspMeta };
export type TCompiledDsp = {
    shaKey: string,
    dspModule: WebAssembly.Module,
    dspHelpers: THelpers,
    effectModule?: WebAssembly.Module,
    effectHelpers?: THelpers,
    codes: TCompiledCodes
}
export type FaustCompileOptions = {
    audioCtx: AudioContext,
    useWorklet?: boolean,
    voices?: number,
    bufferSize?: 128 | 256 | 512 | 1024 | 2048 | 4096,
    args?: {
        /**
         * Flush to zero the code added to recursive signals [0:no (default), 1:fabs based, 2:mask based (fastest)]
         *
         * @type {(0 | 1 | 2)}
         */
        "-ftz"?: 0 | 1 | 2;
        /**
         * Add the directory to the import search path
         *
         * @type {string}
         */
        "-I"?: string;
        [key: string]: any;
    }
    /**
     * first samples to get
     *
     * @type {number}
     */
    plot?: number,
    /**
     * handler for plotted samples
     *
     * @type {(plotted: number[][]) => any}
     */
    plotHandler?: (plotted: number[][]) => any;
}
export type TAudioNodeOptions = {
    /**
     * DSP compiled by libfaust
     *
     * @type {TCompiledDsp}
     */
    compiledDsp: TCompiledDsp,
    audioCtx: AudioContext,
    /**
     * Polyphony voices, 0 or undefined for mono DSP
     *
     * @type {number}
     */
    voices?: number,
    /**
     * - the bufferSize in frames
     *
     * @type {(128 | 256 | 512 | 1024 | 2048 | 4096)}
     */
    bufferSize?: 128 | 256 | 512 | 1024 | 2048 | 4096,
    /**
     * first samples to get
     *
     * @type {number}
     */
    plot?: number,
    /**
     * handler for plotted samples
     *
     * @type {(plotted: number[][]) => any}
     */
    plotHandler?: (plotted: number[][]) => any;
}
