import { LibFaust } from "libfaust-wasm";
import { TCompiledDsp, FaustCompileOptions } from "./types";
import { FaustAudioWorkletNode } from "./FaustAudioWorkletNode";
import { FaustScriptProcessorNode } from "./FaustScriptProcessorNode";
export declare class Faust {
    libFaust: LibFaust;
    createWasmCDSPFactoryFromString: ($name: number, $code: number, argvAuxLength: number, $argv: number, $errorMsg: number, internalMemory: boolean) => number;
    deleteAllWasmCDSPFactories: () => void;
    expandCDSPFromString: ($name: number, $code: number, argvLength: number, $argv: number, $shaKey: number, $errorMsg: number) => number;
    getCLibFaustVersion: () => number;
    getWasmCModule: ($moduleCode: number) => number;
    getWasmCModuleSize: ($moduleCode: number) => number;
    getWasmCHelpers: ($moduleCode: number) => number;
    freeWasmCModule: ($moduleCode: number) => void;
    freeCMemory: ($: number) => number;
    cleanupAfterException: () => void;
    getErrorAfterException: () => number;
    getLibFaustVersion: () => string;
    debug: boolean;
    private dspCount;
    private dspTable;
    private _log;
    constructor(libFaust: LibFaust, options?: {
        debug: boolean;
    });
    getNode(code: string, options: FaustCompileOptions): Promise<FaustAudioWorkletNode | FaustScriptProcessorNode>;
    private compileCode;
    private compileCodes;
    private expandCode;
    private compileDsp;
    private getScriptProcessorNode;
    private getAudioWorkletNode;
    deleteDsp(compiledDsp: TCompiledDsp): void;
    private getCompiledCodesForMachine;
    private getCompiledCodeFromMachine;
    log(...args: any[]): void;
    error(...args: any[]): void;
}
