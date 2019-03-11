/// <reference types="webassembly-js-api" />
export interface FaustWebAssemblyExports {
    getParamValue($dsp: number, $param: number): number;
    setParamValue($dsp: number, $param: number, val: number): void;
    instanceClear($dsp: number): any;
    instanceResetUserInterface($dsp: number): void;
    instanceConstants($dsp: number, sampleRate: number): void;
    init($dsp: number, sampleRate: number): void;
    instanceInit($dsp: number, sampleRate: number): void;
    compute($dsp: number, bufferSize: number, $ins: number, $outs: number): any;
    memory: WebAssembly.Memory;
}