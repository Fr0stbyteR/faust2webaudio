import { LibFaustLoader, LibFaust } from "./LibFaustLoader";
import sha1 from "crypto-libraries/sha1";
import { TCompiledDsp, TCompiledCode, TCompiledCodes, TCompiledStrCodes, FaustCompileOptions } from "./types";
import { FaustWasmToScriptProcessor } from "./FaustWasmToScriptProcessor";
import { FaustScriptProcessorNode } from "./FaustScriptProcessorNode";
import { FaustAudioWorkletProcessorWrapper, FaustData } from "./FaustAudioWorkletProcessor";
import { FaustAudioWorkletNode } from "./FaustAudioWorkletNode";

import * as libFaustDataURI from "./wasm/libfaust-wasm.wasm";
import * as mixer32DataURI from "./wasm/mixer32.wasm";

export const mixer32Base64Code: string = (mixer32DataURI as unknown as string).split(",")[1];
// import * as Binaryen from "binaryen";

const ab2str = (buf: ArrayBuffer): string => buf ? String.fromCharCode.apply(null, new Uint8Array(buf)) : null;
const str2ab = (str: string): ArrayBuffer => {
    if (!str) return null;
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
};
/**
 * Main Faust class,
 * usage: `new Faust().ready.then(faust => any);`
 *
 * @export
 * @class Faust
 */
export class Faust {
    /**
     * The libfaust Wasm Emscripten Module
     *
     * @private
     * @type {LibFaust}
     * @memberof Faust
     */
    private libFaust: LibFaust;
    private createWasmCDSPFactoryFromString: ($name: number, $code: number, argc: number, $argv: number, $errorMsg: number, internalMemory: boolean) => number;
    private deleteAllWasmCDSPFactories: () => void;
    private expandCDSPFromString: ($name: number, $code: number, argc: number, $argv: number, $shaKey: number, $errorMsg: number) => number;
    private getCLibFaustVersion: () => number;
    private getWasmCModule: ($moduleCode: number) => number;
    private getWasmCModuleSize: ($moduleCode: number) => number;
    private getWasmCHelpers: ($moduleCode: number) => number;
    private freeWasmCModule: ($moduleCode: number) => void;
    private freeCMemory: ($: number) => number;
    private cleanupAfterException: () => void;
    private getErrorAfterException: () => number;
    private getLibFaustVersion: () => string;
    private generateCAuxFilesFromString: ($name: number, $code: number, argc: number, $argv: number, $errorMsg: number) => number;
    /**
     * Debug mode, set to true to print out each message
     *
     * @type {boolean}
     * @memberof Faust
     */
    debug: boolean = false;
    /**
     * Current compiled dsp count
     *
     * @private
     * @type {number}
     * @memberof Faust
     */
    private dspCount: number = 0;
    /**
     * An object to storage compiled dsp with it's sha1
     *
     * @private
     * @type {{ [shaKey: string]: TCompiledDsp }}
     * @memberof Faust
     */
    private dspTable: { [shaKey: string]: TCompiledDsp; } = {};
    private _log: string[] = [];
    /**
     * Creates an instance of Faust
     * usage: `new Faust().ready.then(faust => any);`
     *
     * @param {{ debug: boolean; libFaust: LibFaust }} [options]
     * @memberof Faust
     */
    constructor(options?: { debug: boolean; libFaust: LibFaust }) {
        this.debug = options && options.debug ? true : false;
        if (options && options.libFaust) {
            this.libFaust = options.libFaust;
            this.importLibFaustFunctions();
        }
    }
    /**
     * Load a libfaust module from wasm url.
     *
     * @param {string} [url] - url for libfaust wasm file
     * @returns {Promise<Faust>}
     * @memberof Faust
     */
    async loadLibFaust(url?: string): Promise<Faust> {
        if (this.libFaust) return this;
        this.libFaust = await LibFaustLoader.load(url || (libFaustDataURI as unknown as string));
        this.importLibFaustFunctions();
        return this;
    }
    /**
     * A promise to resolve when libfaust is ready.
     *
     * @readonly
     * @type {Promise<Faust>}
     * @memberof Faust
     */
    get ready(): Promise<Faust> {
        return this.loadLibFaust();
    }
    private importLibFaustFunctions(): void {
        if (!this.libFaust) return;
        // Low-level API
        this.createWasmCDSPFactoryFromString = this.libFaust.cwrap("createWasmCDSPFactoryFromString", "number", ["number", "number", "number", "number", "number", "number"]);
        this.deleteAllWasmCDSPFactories = this.libFaust.cwrap("deleteAllWasmCDSPFactories", null, []);
        this.expandCDSPFromString = this.libFaust.cwrap("expandCDSPFromString", "number", ["number", "number", "number", "number", "number", "number"]);
        this.getCLibFaustVersion = this.libFaust.cwrap("getCLibFaustVersion", "number", []);
        this.getWasmCModule = this.libFaust.cwrap("getWasmCModule", "number", ["number"]);
        this.getWasmCModuleSize = this.libFaust.cwrap("getWasmCModuleSize", "number", ["number"]);
        this.getWasmCHelpers = this.libFaust.cwrap("getWasmCHelpers", "number", ["number"]);
        this.freeWasmCModule = this.libFaust.cwrap("freeWasmCModule", null, ["number"]);
        this.freeCMemory = this.libFaust.cwrap("freeCMemory", null, ["number"]);
        this.cleanupAfterException = this.libFaust.cwrap("cleanupAfterException", null, []);
        this.getErrorAfterException = this.libFaust.cwrap("getErrorAfterException", "number", []);
        this.getLibFaustVersion = () => this.libFaust.UTF8ToString(this.getCLibFaustVersion());
        this.generateCAuxFilesFromString = this.libFaust.cwrap("generateCAuxFilesFromString", "number", ["number", "number", "number", "number", "number"]);
    }
    /**
     * Create a AudioNode from dsp source code with options.
     *
     * @param {string} code - the source code
     * @param {FaustCompileOptions} options - options with audioCtx, bufferSize, voices, useWorklet and args
     * @returns {Promise<FaustAudioWorkletNode | FaustScriptProcessorNode>}
     * @memberof Faust
     */
    async getNode(code: string, options: FaustCompileOptions): Promise<FaustAudioWorkletNode | FaustScriptProcessorNode> {
        const audioCtx = options.audioCtx;
        const voices = options.voices;
        const useWorklet = options.useWorklet;
        const bufferSize = options.bufferSize;
        const argv = [] as string[];
        for (const key in options.args) {
            argv.push(key);
            argv.push(options.args[key]);
        }
        const compiledDsp = await this.compileCodes(code, argv, voices ? false : true);
        if (!compiledDsp) return null;
        const node = await this[useWorklet ? "getAudioWorkletNode" : "getScriptProcessorNode"](compiledDsp, audioCtx, useWorklet ? 128 : bufferSize, voices);
        return node;
    }
    /**
     * Generate Uint8Array and helpersCode from a dsp source code
     *
     * @private
     * @param {string} factoryName - Class name of the source code
     * @param {string} code - dsp source code
     * @param {string[]} argvIn - Array of paramaters to be given to the Faust compiler
     * @param {boolean} internalMemory - Use internal Memory flag, false for poly, true for mono
     * @returns {TCompiledCode} - An object with ui8Code, code, helpersCode
     * @memberof Faust
     */
    private compileCode(factoryName: string, code: string, argvIn: string[], internalMemory: boolean): TCompiledCode {
        const codeSize = this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = this.libFaust._malloc(codeSize);
        const name = "FaustDSP";
        const nameSize = this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = this.libFaust._malloc(nameSize);
        const $errorMsg = this.libFaust._malloc(4096);

        this.libFaust.stringToUTF8(name, $name, nameSize);
        this.libFaust.stringToUTF8(code, $code, codeSize);

        // Add 'cn' option with the factory name
        const argv = argvIn || [];
        argv.push("-cn", factoryName);

        // Prepare 'argv_aux' array for C side
        const ptrSize = 4;
        const $argv = this.libFaust._malloc(argv.length * ptrSize);  // Get buffer from emscripten.
        let argvBuffer$ = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argv.length);  // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argv.length; i++) {
            const $arg_size = this.libFaust.lengthBytesUTF8(argv[i]) + 1;
            const $arg = this.libFaust._malloc($arg_size);
            this.libFaust.stringToUTF8(argv[i], $arg, $arg_size);
            argvBuffer$[i] = $arg;
        }
        try {
            const time1 = performance.now();
            const $moduleCode = this.createWasmCDSPFactoryFromString($name, $code, argv.length, $argv, $errorMsg, internalMemory);
            const time2 = performance.now();
            this.log("Faust compilation duration : " + (time2 - time1));
            const errorMsg = this.libFaust.UTF8ToString($errorMsg);
            if (errorMsg) throw errorMsg;
            /*
            // New API test

            //var code =  "process = _,_,_,_;";
            var code =  "import(\"stdfaust.lib\"); process = dm.zita_rev1;";
            //var code = "import(\"stdfaust.lib\"); vol = vslider(\"vol\", 0.6, 0, 1, 0.01); process = _+vol,_+(0.3*vol);";
            //var code = "import(\"stdfaust.lib\"); vol = vslider(\"vol\", 0.6, 0, 1, 0.01); process = (_+vol)*os.osc(440),_+(0.3*vol*os.osc(800));";
            //var code = "import(\"stdfaust.lib\"); process = os.osc(440);";

            var argv1 = faustModule.makeStringVector();
            console.log(argv1);
            argv1.push_back("-ftz");
            argv1.push_back("2");
            argv1.push_back("-cn");
            argv1.push_back(factory_name);
            argv1.push_back("-I");
            argv1.push_back("http://127.0.0.1:8000/libraries/");

            var time3 = performance.now();
            var factory_ptr = faustModule.wasm_dynamic_dsp_factory.createWasmDSPFactoryFromString2("FaustDSP", code, argv1, false);
            console.log("FACTORY JSON : " + factory_ptr.getJSON())

            var time4 = performance.now();
            console.log("C++ Faust compilation duration : " + (time4 - time3));

            if (factory_ptr) {
                console.log("factory_ptr " + factory_ptr);
                var instance_ptr = factory_ptr.createDSPInstance();
                console.log("instance_ptr " + instance_ptr);
                console.log("instance_ptr getNumInputs " + instance_ptr.getNumInputs());
                console.log("instance_ptr getNumOutputs " + instance_ptr.getNumOutputs());
                instance_ptr.init(44100);

                instance_ptr.computeJSTest(128);
                //instance_ptr.compute(128, 0, 0);

            } else {
                console.log("getErrorMessage " + faustModule.wasm_dsp_factory.getErrorMessage());
            }

            fetch('t1.wasm')
            .then(dsp_file => dsp_file.arrayBuffer())
            .then(dsp_bytes => { var factory_ptr1 = faustModule.wasm_dsp_factory.readWasmDSPFactoryFromMachine2(dsp_bytes);
                console.log("factory_ptr1 " + factory_ptr);
                var instance_ptr1 = factory_ptr.createDSPInstance();
                console.log("instance_ptr1 " + instance_ptr);
                console.log("instance_ptr1 getNumInputs " + instance_ptr1.getNumInputs());
                console.log("instance_ptr1 getNumOutputs " + instance_ptr1.getNumOutputs());

                //console.log("faustModule.wasm_dsp_factory.createAudioBuffers " + faustModule.wasm_dsp_factory.createAudioBuffers);

                var js_inputs = faustModule.wasm_dsp_factory.createAudioBuffers(instance_ptr1.getNumInputs(), 256);
                var js_outputs = faustModule.wasm_dsp_factory.createAudioBuffers(instance_ptr1.getNumOutputs(), 256);

                //console.log("instance_ptr1.compute " + instance_ptr1.compute);

                instance_ptr1.compute(256, js_inputs, js_outputs);

                faustModule.wasm_dsp_factory.deleteAudioBuffers(js_inputs, instance_ptr1.getNumInputs());
                faustModule.wasm_dsp_factory.deleteAudioBuffers(js_outputs, instance_ptr1.getNumOutputs());

                //instance_ptr1.computeJSTest(128);
            });

            // End API test
            */
            if ($moduleCode === 0) return null;
            const $compiledCode = this.getWasmCModule($moduleCode);
            const compiledCodeSize = this.getWasmCModuleSize($moduleCode);
            // Copy native 'binary' string in JavaScript Uint8Array
            const ui8Code = new Uint8Array(compiledCodeSize);
            for (let i = 0; i < compiledCodeSize; i++) {
                // faster than 'getValue' which gets the type of access for each read...
                ui8Code[i] = this.libFaust.HEAP8[$compiledCode + i];
            }
            const $helpersCode = this.getWasmCHelpers($moduleCode);
            const helpersCode = this.libFaust.UTF8ToString($helpersCode);
            // Free strings
            this.libFaust._free($code);
            this.libFaust._free($name);
            this.libFaust._free($errorMsg);
            // Free C allocated wasm module
            this.freeWasmCModule($moduleCode);
            // Get an updated integer view on the newly allocated buffer after possible emscripten memory grow
            argvBuffer$ = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argv.length);
            // Free 'argv' C side array
            for (let i = 0; i < argv.length; i++) {
                this.libFaust._free(argvBuffer$[i]);
            }
            this.libFaust._free($argv);
            return { ui8Code, code, helpersCode } as TCompiledCode;
        } catch (e) {
            // libfaust is compiled without C++ exception activated, so a JS exception is throwed and catched here
            let errorMsg = this.libFaust.UTF8ToString(this.getErrorAfterException());
            // Report the Emscripten error
            if (!errorMsg) errorMsg = e;
            this.cleanupAfterException();
            throw errorMsg;
        }
    }
    /**
     * createDSPFactoryAux
     * Generate shaKey, effects, dsp, their Wasm Modules and helpers from a dsp source code
     *
     * @private
     * @param {string} code - dsp source code
     * @param {string[]} argv - Array of paramaters to be given to the Faust compiler
     * @param {boolean} internalMemory - Use internal Memory flag, false for poly, true for mono
     * @returns {Promise<TCompiledDsp>} - An object contains shaKey, empty polyphony map, original codes, modules and helpers
     * @memberof Faust
     */
    private async compileCodes(code: string, argv: string[], internalMemory: boolean): Promise<TCompiledDsp> {
        // Code memory type and argv in the SHAKey to differentiate compilation flags and Monophonic and Polyphonic factories
        const strArgv = argv.join("");
        const shaKey = sha1.hash(code + (internalMemory ? "internal_memory" : "external_memory") + strArgv, { msgFormat: "string" });
        const compiledDsp = this.dspTable[shaKey];
        if (compiledDsp) {
            this.log("Existing library : " + compiledDsp.codes.dspName);
            // Existing factory, do not create it...
            return compiledDsp;
        }
        this.log("libfaust.js version : " + this.getLibFaustVersion());
        // Factory name for DSP and effect
        const dspName = "mydsp" + this.dspCount;
        const effectName = "effect" + this.dspCount++;
        // Create 'effect' expression
        const effectCode = `adapt(1,1) = _; adapt(2,2) = _,_; adapt(1,2) = _ <: _,_; adapt(2,1) = _,_ :> _;
adaptor(F,G) = adapt(outputs(F),inputs(G));
dsp_code = environment{${code}};
process = adaptor(dsp_code.process, dsp_code.effect) : dsp_code.effect;`;
        const dspCompiledCode = this.compileCode(dspName, code, argv, internalMemory);
        let effectCompiledCode: TCompiledCode;
        try {
            effectCompiledCode = this.compileCode(effectName, effectCode, argv, internalMemory);
        } catch (e) {}
        const compiledCodes = { dspName, effectName, dsp: dspCompiledCode, effect: effectCompiledCode } as TCompiledCodes;
        return this.compileDsp(compiledCodes, shaKey);
    }
    /**
     * From a DSP source file, creates a "self-contained" DSP source string where all needed librairies have been included.
     * All compilations options are 'normalized' and included as a comment in the expanded string.
     *
     * @private
     * @param {string} code - dsp source code
     * @param {string[]} argvIn - Array of paramaters to be given to the Faust compiler
     * @returns {string} "self-contained" DSP source string where all needed librairies
     * @memberof Faust
     */
    private expandCode(code: string, argvIn: string[]): string {
        this.log("libfaust.js version : " + this.getLibFaustVersion());
        // Allocate strings on the HEAP
        const codeSize = this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = this.libFaust._malloc(codeSize);

        const name = "FaustDSP";
        const nameSize = this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = this.libFaust._malloc(nameSize);

        const $shaKey = this.libFaust._malloc(64);
        const $errorMsg = this.libFaust._malloc(4096);

        this.libFaust.stringToUTF8(name, $name, nameSize);
        this.libFaust.stringToUTF8(code, $code, codeSize);

        const argv = argvIn || [];
        // Force "wasm" compilation
        argv.push("-lang");
        argv.push("wasm");

        // Prepare 'argv' array for C side
        const ptrSize = 4;
        const $argv = this.libFaust._malloc(argv.length * ptrSize);  // Get buffer from emscripten.
        let $argv_buffer = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argv.length);  // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argv.length; i++) {
            const $arg_size = this.libFaust.lengthBytesUTF8(argv[i]) + 1;
            const $arg = this.libFaust._malloc($arg_size);
            this.libFaust.stringToUTF8(argv[i], $arg, $arg_size);
            $argv_buffer[i] = $arg;
        }
        try {
            const $expandedCode = this.expandCDSPFromString($name, $code, argv.length, $argv, $shaKey, $errorMsg);
            const expandedCode = this.libFaust.UTF8ToString($expandedCode);
            const shaKey = this.libFaust.UTF8ToString($shaKey);
            const errorMsg = this.libFaust.UTF8ToString($errorMsg);
            if (errorMsg) this.error(errorMsg);
            // Free strings
            this.libFaust._free($code);
            this.libFaust._free($name);
            this.libFaust._free($shaKey);
            this.libFaust._free($errorMsg);
            // Free C allocated expanded string
            this.freeCMemory($expandedCode);
            // Get an updated integer view on the newly allocated buffer after possible emscripten memory grow
            $argv_buffer = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argv.length);
            // Free 'argv' C side array
            for (let i = 0; i < argv.length; i++) {
                this.libFaust._free($argv_buffer[i]);
            }
            this.libFaust._free($argv);
            return expandedCode;
        } catch (e) {
            // libfaust is compiled without C++ exception activated, so a JS exception is throwed and catched here
            let errorMsg = this.libFaust.UTF8ToString(this.getErrorAfterException());
            // Report the Emscripten error
            if (!errorMsg) errorMsg = e;
            this.cleanupAfterException();
            throw errorMsg;
        }
    }
    /**
     * readDSPFactoryFromMachineAux
     * Compile wasm modules from dsp and effect Uint8Arrays
     *
     * @private
     * @param {TCompiledCodes} codes
     * @param {string} shaKey
     * @returns {Promise<TCompiledDsp>}
     * @memberof Faust
     */
    private async compileDsp(codes: TCompiledCodes, shaKey: string): Promise<TCompiledDsp> {
        const time1 = performance.now();
        /*
        if (typeof Binaryen !== "undefined") {
            try {
                const binaryenModule = Binaryen.readBinary(codes.dsp.ui8Code);
                this.log("Binaryen based optimisation");
                binaryenModule.optimize();
                // console.log(binaryen_module.emitText());
                codes.dsp.ui8Code = binaryenModule.emitBinary();
                binaryenModule.dispose();
            } catch (e) {
                this.log("Binaryen not available, no optimisation...");
            }
        }
        */
        const dspModule = await WebAssembly.compile(codes.dsp.ui8Code);
        if (!dspModule) {
            this.error("Faust DSP factory cannot be compiled");
            throw "Faust DSP factory cannot be compiled";
        }
        const time2 = performance.now();
        this.log("WASM compilation duration : " + (time2 - time1));
        const compiledDsp = { shaKey, codes, dspModule, polyphony: [] as number[] } as TCompiledDsp; // Default mode
        // 'libfaust.js' wasm backend generates UI methods, then we compile the code
        // eval(helpers_code1);
        // factory.getJSON = eval("getJSON" + dspName);
        // factory.getBase64Code = eval("getBase64Code" + dspName);
        try {
            const json = codes.dsp.helpersCode.match(/getJSON\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*'(\{.+?)';}/)[1];
            const base64Code = codes.dsp.helpersCode.match(/getBase64Code\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*"([A-Za-z0-9+/=]+?)";[\s\n]+}/)[1];
            const meta = JSON.parse(json);
            compiledDsp.dspHelpers = { json, base64Code, meta };
        } catch (e) {
            this.error("Error in JSON.parse: " + e);
            throw e;
        }
        this.dspTable[shaKey] = compiledDsp;
        // Possibly compile effect
        if (!codes.effectName || !codes.effect) return compiledDsp;
        try {
            const effectModule = await WebAssembly.compile(codes.effect.ui8Code);
            compiledDsp.effectModule = effectModule;
            // 'libfaust.js' wasm backend generates UI methods, then we compile the code
            // eval(helpers_code2);
            // factory.getJSONeffect = eval("getJSON" + factory_name2);
            // factory.getBase64Codeeffect = eval("getBase64Code" + factory_name2);
            try {
                const json = codes.effect.helpersCode.match(/getJSON\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*'(\{.+?)';}/)[1];
                const base64Code = codes.effect.helpersCode.match(/getBase64Code\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*"([A-Za-z0-9+/=]+?)";[\s\n]+}/)[1];
                const meta = JSON.parse(json);
                compiledDsp.effectHelpers = { json, base64Code, meta };
            } catch (e) {
                this.error("Error in JSON.parse: " + e);
                throw e;
            }
        } catch (e) {
            return compiledDsp;
        }
        return compiledDsp;
    }
    /**
     * Get a ScriptProcessorNode from compiled dsp
     *
     * @private
     * @param {TCompiledDsp} compiledDsp - DSP compiled by libfaust
     * @param {AudioContext} audioCtx
     * @param {number} [bufferSize] - By default 512
     * @param {number} [voices] - Polyphony voices, 0 or undefined for mono DSP
     * @returns {Promise<FaustScriptProcessorNode>}
     * @memberof Faust
     */
    private async getScriptProcessorNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSize?: number, voices?: number): Promise<FaustScriptProcessorNode> {
        return await new FaustWasmToScriptProcessor(this).getNode(compiledDsp, audioCtx, bufferSize, voices);
    }
    // deleteDSPInstance() {}
    /**
     * Get a AudioWorkletNode from compiled dsp
     *
     * @private
     * @param {TCompiledDsp} compiledDsp - DSP compiled by libfaust
     * @param {AudioContext} audioCtx
     * @param {number} [bufferSize] - By default 128 (and it should be)
     * @param {number} [voices] - Polyphony voices, 0 or undefined for mono DSP
     * @returns {Promise<FaustAudioWorkletNode>}
     * @memberof Faust
     */
    private async getAudioWorkletNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSize?: number, voices?: number): Promise<FaustAudioWorkletNode> {
        if (compiledDsp.polyphony.indexOf(voices || 0) === -1) {
            const strProcessor = `
const faustData = ${JSON.stringify({
    bufferSize,
    voices,
    name: compiledDsp.codes.dspName,
    dspMeta: compiledDsp.dspHelpers.meta,
    dspBase64Code: compiledDsp.dspHelpers.base64Code,
    effectMeta: compiledDsp.effectHelpers ? compiledDsp.effectHelpers.meta : undefined,
    effectBase64Code: compiledDsp.effectHelpers ? compiledDsp.effectHelpers.base64Code : undefined,
    mixerBase64Code: mixer32Base64Code
} as FaustData)};
(${FaustAudioWorkletProcessorWrapper.toString()})();
`;
            const url = window.URL.createObjectURL(new Blob([strProcessor], { type: "text/javascript" }));
            await audioCtx.audioWorklet.addModule(url);
            compiledDsp.polyphony.push(voices || 0);
        }
        return new FaustAudioWorkletNode(audioCtx, compiledDsp, voices);
    }
    /**
     * Remove a DSP from registry
     *
     * @private
     * @param {TCompiledDsp} compiledDsp
     * @memberof Faust
     */
    private deleteDsp(compiledDsp: TCompiledDsp): void {
        // The JS side is cleared
        delete this.dspTable[compiledDsp.shaKey];
        // The native C++ is cleared each time (freeWasmCModule has been already called in faust.compile)
        this.deleteAllWasmCDSPFactories();
    }
    /**
     * Stringify current storaged DSP Table.
     *
     * @returns {string}
     * @memberof Faust
     */
    stringifyDspTable(): string {
        const strTable = {} as { [shaKey: string]: TCompiledStrCodes };
        for (const key in this.dspTable) {
            const codes = this.dspTable[key].codes;
            strTable[key] = {
                dspName: codes.dspName,
                dsp: {
                    strCode: ab2str(codes.dsp.ui8Code),
                    code: codes.dsp.code,
                    helpersCode: codes.dsp.helpersCode
                },
                effectName: codes.effectName,
                effect: {
                    strCode: ab2str(codes.effect.ui8Code),
                    code: codes.effect.code,
                    helpersCode: codes.effect.helpersCode
                }
            };
        }
        return JSON.stringify(strTable);
    }
    /**
     * parse and store a stringified DSP Table.
     *
     * @param {string} str
     * @memberof Faust
     */
    async parseDspTable(str: string) {
        const strTable = JSON.parse(str) as { [shaKey: string]: TCompiledStrCodes };
        for (const shaKey in strTable) {
            if (this.dspTable[shaKey]) continue;
            const strCodes = strTable[shaKey];
            const compiledCodes = {
                dspName: strCodes.dspName,
                effectName: strCodes.effectName,
                dsp: {
                    ui8Code: str2ab(strCodes.dsp.strCode),
                    code: strCodes.dsp.code,
                    helpersCode: strCodes.dsp.helpersCode
                },
                effect: {
                    ui8Code: str2ab(strCodes.effect.strCode),
                    code: strCodes.effect.code,
                    helpersCode: strCodes.effect.helpersCode
                }
            } as TCompiledCodes;
            this.dspTable[shaKey] = await this.compileDsp(compiledCodes, shaKey);
        }
    }
    // deleteDSPWorkletInstance() {}
    /**
     * Get an SVG Diagram XML File as string
     *
     * @param {string} code faust source code
     * @param {string[]} argvIn faust compilation argv
     * @returns {string} svg file as string
     * @memberof Faust
     */
    getDiagram(code: string, argvIn: string[]): string {
        const codeSize = this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = this.libFaust._malloc(codeSize);
        const name = "FaustDSP";
        const nameSize = this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = this.libFaust._malloc(nameSize);
        const $errorMsg = this.libFaust._malloc(4096);

        const argv = [...argvIn, "-lang", "wast", "-o", "/dev/null", "-svg"];
        this.libFaust.stringToUTF8(name, $name, nameSize);
        this.libFaust.stringToUTF8(code, $code, codeSize);

        // Prepare 'argv' array for C side
        const ptrSize = 4;
        const $argv = this.libFaust._malloc(argv.length * ptrSize);  // Get buffer from emscripten.
        const argvBuffer$ = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argv.length);  // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argv.length; i++) {
            const $arg_size = this.libFaust.lengthBytesUTF8(argv[i]) + 1;
            const $arg = this.libFaust._malloc($arg_size);
            this.libFaust.stringToUTF8(argv[i], $arg, $arg_size);
            argvBuffer$[i] = $arg;
        }
        this.generateCAuxFilesFromString($name, $code, argv.length, $argv, $errorMsg);
        return this.libFaust.FS.readFile("FaustDSP-svg/process.svg", { encoding: "utf8" });
    }
    /**
     * Read a file from LibFaust Emscripten Module File System
     *
     * @param {string} path path string
     * @returns {string} file as string UTF-8 encoded
     * @memberof Faust
     */
    readFile(path: string): string {
        return this.libFaust.FS.readFile(path, { encoding: "utf8" });
    }
    log(...args: any[]) {
        if (this.debug) console.log(...args);
        const msg = JSON.stringify(args.length !== 1 ? args : args[0]);
        this._log.push(msg);
        if (typeof this.logHandler === "function") this.logHandler(msg, 0);
    }
    error(...args: any[]) {
        console.error(...args);
        const msg = JSON.stringify(args.length !== 1 ? args : args[0]);
        this._log.push(msg);
        if (typeof this.logHandler === "function") this.logHandler(msg, 1);
    }
    logHandler: (msg: string, errorLevel: 1 | 0) => any;
}
