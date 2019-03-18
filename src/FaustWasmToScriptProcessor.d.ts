/// <reference types="webassembly-js-api" />
import { Faust } from "./Faust";
import { FaustScriptProcessorNode } from "./FaustScriptProcessorNode";
import { TCompiledDsp } from "./types";
export declare class FaustWasmToScriptProcessor {
    private static heap2Str;
    private static readonly importObject;
    faust: Faust;
    constructor(faust: Faust);
    private initNode;
    getNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSize: number, voices?: number): Promise<FaustScriptProcessorNode>;
    static createMemory(compiledDsp: TCompiledDsp, bufferSize: number, voices: number): WebAssembly.Memory;
}
