/// <reference types="webassembly-js-api" />
type TDSPMeta = {
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
    ui: []
};
type TFaustUIItem = TFaustUIInputItem | TFaustUIOutputItem | TFaustUIGroup;
type TFaustUIInputItem = {
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
type TFaustUIOutputItem = {
    type: TFaustUIInputType,
    label: string,
    address: string,
    index: string,
    min?: string,
    max?: string,
};
type TFaustUIGroupType = "vgroup" | "hgroup" | "tgroup";
type TFaustUIOutputType = "hbargraph" | "vbargraph";
type TFaustUIInputType = "vslider" | "hslider" | "button" | "checkbox" | "nentry";
type TFaustUIGroup = {
    type: TFaustUIGroupType,
    label: string,
    items: TFaustUIItem[]
}
type TFaustUIType = TFaustUIGroupType | TFaustUIOutputType | TFaustUIInputType;
type TCompiledCode = { ui8Code: Uint8Array, code: string, helpersCode: string };
type TCompiledStrCode = { strCode: string, code: string, helpersCode: string };
type TCompiledCodes = { dspName: string, dsp: TCompiledCode, effectName?: string, effect?: TCompiledCode};
type TCompiledStrCodes = { dspName: string, dsp: TCompiledStrCode, effectName?: string, effect?: TCompiledStrCode};
type THelpers = { json: string, base64Code: string, meta: TDSPMeta };
type TCompiledDsp = {
    shaKey: string,
    polyphony: number[],
    dspModule: WebAssembly.Module,
    dspHelpers: THelpers,
    effectModule?: WebAssembly.Module,
    effectHelpers?: THelpers,
    codes: TCompiledCodes
}
declare module "libfaust-wasm/src/libfaust-wasm.wasm" {
    export function wasmInstantiate(): Promise<{ instance: WebAssembly.Instance, module: WebAssembly.Module }>;
    export default wasmInstantiate ;
}
interface Window { [key: string]: any }