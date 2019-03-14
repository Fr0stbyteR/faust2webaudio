import { LibFaustLoader, LibFaust } from "libfaust-wasm";
import sha1 from "crypto-libraries/sha1";
import { TCompiledDsp, TCompiledCode, TCompiledCodes, TCompiledStrCodes, FaustCompileOptions } from "./types";
import { FaustWasmToScriptProcessor } from "./FaustWasmToScriptProcessor";
import { FaustAudioWorkletProcessorWrapper } from "./FaustAudioWorkletProcessor";
import { FaustAudioWorkletNode } from "./FaustAudioWorkletNode";
// import * as Binaryen from "binaryen";
const ab2str = (buf: ArrayBuffer): string => buf ? String.fromCharCode.apply(null, new Uint8Array(buf)) : null;
const str2ab = (str: string) => {
    if (!str) return null;
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
};
export class Faust {
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
    debug = false;
    private dspCount = 0;
    private dspTable = {} as { [key: string]: TCompiledDsp };
    private _log = [] as string[];
    constructor(libFaust: LibFaust, options?: { debug: boolean; }) {
        this.debug = options && options.debug ? true : false;
        this.libFaust = libFaust;
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
        this.getLibFaustVersion = () => libFaust.UTF8ToString(this.getCLibFaustVersion());
    }
    async getNode(code: string, options: FaustCompileOptions) {
        const audioCtx = options.audioCtx;
        const voices = options.voices;
        const useWorklet = options.useWorklet;
        const bufferSize = options.bufferSize;
        const argv = [] as string[];
        for (const key in options.argv) {
            argv.push("-" + key);
            argv.push(options.argv[key]);
        }
        const compiledDsp = await this.compileCodes(code, argv, voices ? false : true);
        if (!compiledDsp) return null;
        const node = await this[useWorklet ? "getAudioWorkletNode" : "getScriptProcessorNode"](compiledDsp, audioCtx, bufferSize, voices);
        return node;
    }
    private compileCode(factoryName: string, code: string, argv: string[], internalMemory: boolean) {
        const codeSize = this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = this.libFaust._malloc(codeSize);
        const name = "FaustDSP";
        const nameSize = this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = this.libFaust._malloc(nameSize);
        const $errorMsg = this.libFaust._malloc(4096);

        this.libFaust.stringToUTF8(name, $name, nameSize);
        this.libFaust.stringToUTF8(code, $code, codeSize);

        // Add 'cn' option with the factory name
        const argvAux = argv || [];
        argvAux.push("-cn", factoryName);

        // Prepare 'argv_aux' array for C side
        const ptrSize = 4;
        const $argv = this.libFaust._malloc(argvAux.length * ptrSize);  // Get buffer from emscripten.
        let $argv_buffer = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argvAux.length);  // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argvAux.length; i++) {
            const $arg_size = this.libFaust.lengthBytesUTF8(argvAux[i]) + 1;
            const $arg = this.libFaust._malloc($arg_size);
            this.libFaust.stringToUTF8(argvAux[i], $arg, $arg_size);
            $argv_buffer[i] = $arg;
        }
        try {
            const time1 = performance.now();
            const $moduleCode = this.createWasmCDSPFactoryFromString($name, $code, argvAux.length, $argv, $errorMsg, internalMemory);
            const time2 = performance.now();
            this.log("Faust compilation duration : " + (time2 - time1));

            const errorMsg = this.libFaust.UTF8ToString($errorMsg);
            if (errorMsg) this.error(errorMsg);

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
            $argv_buffer = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argvAux.length);
            // Free 'argv' C side array
            for (let i = 0; i < argvAux.length; i++) {
                this.libFaust._free($argv_buffer[i]);
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
    private async compileCodes(code: string, argv: string[], internalMemory: boolean) {
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

        if (!dspCompiledCode) return null;
        let effectCompiledCode: TCompiledCode;
        try {
            effectCompiledCode = this.compileCode(effectName, effectCode, argv, internalMemory);
        } catch (e) {}
        const compiledCodes = { dspName, effectName, dsp: dspCompiledCode, effect: effectCompiledCode } as TCompiledCodes;
        return this.compileDsp(compiledCodes, shaKey);
    }
    private expandCode(code: string, argvIn: string[]) {
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
    private async compileDsp(codes: TCompiledCodes, shaKey: string) {
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
        if (!dspModule) return this.error("Faust DSP factory cannot be compiled");
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
    }
    private async getScriptProcessorNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSize?: number, voices?: number) {
        return await new FaustWasmToScriptProcessor(this).getNode(compiledDsp, audioCtx, bufferSize, voices);
    }
    // deleteDSPInstance() {}
    private async getAudioWorkletNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSize?: number, voices?: number) {
        if (compiledDsp.polyphony.indexOf(voices) === -1) {
            const strProcessor = `
const faustData = ${JSON.stringify({
    bufferSize,
    voices,
    name: compiledDsp.codes.dspName,
    dspMeta: compiledDsp.dspHelpers.meta,
    dspBase64Code: compiledDsp.dspHelpers.base64Code,
    effectMeta: compiledDsp.effectHelpers ? compiledDsp.effectHelpers.meta : undefined,
    effectBase64Code: compiledDsp.effectHelpers ? compiledDsp.effectHelpers.base64Code : undefined
})};
(${FaustAudioWorkletProcessorWrapper.toString()})();
`;
            const url = window.URL.createObjectURL(new Blob([strProcessor], { type: "text/javascript" }));
            await audioCtx.audioWorklet.addModule(url);
            compiledDsp.polyphony.push(voices || 1);
        }
        return new FaustAudioWorkletNode(audioCtx, compiledDsp);
    }
    deleteDsp(compiledDsp: TCompiledDsp) {
        // The JS side is cleared
        delete this.dspTable[compiledDsp.shaKey];
        // The native C++ is cleared each time (freeWasmCModule has been already called in faust.compile)
        this.deleteAllWasmCDSPFactories();
    }
    private getCompiledCodesForMachine(compiledCodes: TCompiledCodes) {
        return {
            dspName: compiledCodes.dspName,
            dsp: {
                strCode: ab2str(compiledCodes.dsp.ui8Code),
                code: compiledCodes.dsp.code,
                helpersCode: compiledCodes.dsp.helpersCode
            },
            effectName : compiledCodes.effectName,
            effect: {
                strCode: ab2str(compiledCodes.effect.ui8Code),
                code: compiledCodes.effect.code,
                helpersCode: compiledCodes.effect.helpersCode
            }
        } as TCompiledStrCodes;
    }
    private async getCompiledCodeFromMachine(compiledStrCodes: TCompiledStrCodes) {
        const shaKey = sha1.hash(compiledStrCodes.dsp.code, { msgFormat: "string" });
        const compiledDsp = this.dspTable[shaKey];
        if (compiledDsp) {
            this.log("Existing library : " + compiledDsp.codes.dspName);
            // Existing factory, do not create it...
            return compiledDsp;
        }
        const compiledCodes = {
            dspName: compiledStrCodes.dspName,
            effectName: compiledStrCodes.effectName,
            dsp: {
                ui8Code: str2ab(compiledStrCodes.dsp.strCode),
                code: compiledStrCodes.dsp.code,
                helpersCode: compiledStrCodes.dsp.helpersCode
            },
            effect: {
                ui8Code: str2ab(compiledStrCodes.effect.strCode),
                code: compiledStrCodes.effect.code,
                helpersCode: compiledStrCodes.effect.helpersCode
            }
        } as TCompiledCodes;
        return this.compileDsp(compiledCodes, shaKey);
    }
    // deleteDSPWorkletInstance() {}
    log(...args: any[]) {
        if (this.debug) console.log(...args);
        this._log.push(JSON.stringify(args));
    }
    error(...args: any[]) {
        console.error(...args);
        this._log.push(JSON.stringify(args));
    }
}
window["F2SP"] = FaustWasmToScriptProcessor;
LibFaustLoader.load("./libfaust-wasm.wasm").then(libFaust => window["faust"] = new Faust(libFaust));
window["LibFaustLoader"] = LibFaustLoader;

const mydspPolyProcessorString = `

'use strict';

function getJSONmydsp() { return faustData.dspMeta; }
function getJSONeffect() { return faustData.effectMeta.json; }

function getBase64Codemydsp() { return faustData.dspBase64Code; }
function getBase64Codeeffect() { return faustData.effectBase64Code; }

function getBase64Mixer() { return "AGFzbQEAAAABj4CAgAACYAN/f38AYAR/f39/AX0CkoCAgAABBm1lbW9yeQZtZW1vcnkCAAIDg4CAgAACAAEHmoCAgAACC2NsZWFyT3V0cHV0AAAIbWl4Vm9pY2UAAQqKgoCAAALigICAAAEDfwJAQQAhBQNAAkAgAiAFQQJ0aigCACEDQQAhBANAAkAgAyAEQQJ0akMAAAAAOAIAIARBAWohBCAEIABIBEAMAgUMAQsACwsgBUEBaiEFIAUgAUgEQAwCBQwBCwALCwsLnYGAgAACBH8DfQJ9QQAhB0MAAAAAIQgDQAJAQQAhBiACIAdBAnRqKAIAIQQgAyAHQQJ0aigCACEFA0ACQCAEIAZBAnRqKgIAIQkgCCAJi5chCCAFIAZBAnRqKgIAIQogBSAGQQJ0aiAKIAmSOAIAIAZBAWohBiAGIABIBEAMAgUMAQsACwsgB0EBaiEHIAcgAUgEQAwCBQwBCwALCyAIDwsL"; }
const MAX_POLYPHONY = faustData.voices;
// Polyphonic Faust DSP
class mydspPolyProcessor extends AudioWorkletProcessor {

    // JSON parsing functions
    static parse_ui(ui, obj, callback)
    {
        for (var i = 0; i < ui.length; i++) {
            mydspPolyProcessor.parse_group(ui[i], obj, callback);
        }
    }

    static parse_group(group, obj, callback)
    {
        if (group.items) {
            mydspPolyProcessor.parse_items(group.items, obj, callback);
        }
    }

    static parse_items(items, obj, callback)
    {
        for (var i = 0; i < items.length; i++) {
            callback(items[i], obj, callback);
        }
    }

    static parse_item1(item, obj, callback)
    {
        if (item.type === "vgroup"
            || item.type === "hgroup"
            || item.type === "tgroup") {
            mydspPolyProcessor.parse_items(item.items, obj, callback);
        } else if (item.type === "hbargraph"
                   || item.type === "vbargraph") {
        // Nothing
        } else if (item.type === "vslider"
                   || item.type === "hslider"
                   || item.type === "button"
                   || item.type === "checkbox"
                   || item.type === "nentry") {
            obj.push({ name: item.address,
                     defaultValue: item.init,
                     minValue: item.min,
                     maxValue: item.max });
        }
    }

    static parse_item2(item, obj, callback)
    {
        if (item.type === "vgroup"
            || item.type === "hgroup"
            || item.type === "tgroup") {
            mydspPolyProcessor.parse_items(item.items, obj, callback);
        } else if (item.type === "hbargraph"
                   || item.type === "vbargraph") {
            // Keep bargraph adresses
            obj.outputs_items.push(item.address);
            obj.pathTable[item.address] = parseInt(item.index);
        } else if (item.type === "vslider"
                   || item.type === "hslider"
                   || item.type === "button"
                   || item.type === "checkbox"
                   || item.type === "nentry") {
            // Keep inputs adresses
            obj.inputs_items.push(item.address);
            obj.pathTable[item.address] = parseInt(item.index);
            if (item.meta !== undefined) {
                for (var i = 0; i < item.meta.length; i++) {
                    if (item.meta[i].midi !== undefined) {
                        if (item.meta[i].midi.trim() === "pitchwheel") {
                            obj.fPitchwheelLabel.push(item.address);
                        } else if (item.meta[i].midi.trim().split(" ")[0] === "ctrl") {
                            obj.fCtrlLabel[parseInt(item.meta[i].midi.trim().split(" ")[1])]
                            .push({ path:item.address,
                                  min:parseFloat(item.min),
                                  max:parseFloat(item.max) });
                        }
                    }
                }
            }
        }
    }

    static b64ToUint6(nChr)
    {
        return nChr > 64 && nChr < 91 ?
        nChr - 65
        : nChr > 96 && nChr < 123 ?
        nChr - 71
        : nChr > 47 && nChr < 58 ?
        nChr + 4
        : nChr === 43 ?
        62
        : nChr === 47 ?
        63
        :
        0;
    }

    static atob(sBase64, nBlocksSize)
    {
        if (typeof atob === 'function') {
            return atob(sBase64);
        } else {

            var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, "");
            var nInLen = sB64Enc.length;
            var nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2;
            var taBytes = new Uint8Array(nOutLen);

            for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
                nMod4 = nInIdx & 3;
                nUint24 |= mydspPolyProcessor.b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
                if (nMod4 === 3 || nInLen - nInIdx === 1) {
                    for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
                        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
                    }
                    nUint24 = 0;
                }
            }
            return taBytes.buffer;
        }
    }

    static remap(v, mn0, mx0, mn1, mx1)
    {
        return (1.0 * (v - mn0) / (mx0 - mn0)) * (mx1 - mn1) + mn1;
    }

    static get parameterDescriptors ()
    {
        // Analyse JSON to generate AudioParam parameters
        var params = [];

        // Add instrument parameters
        mydspPolyProcessor.parse_ui(faustData.dspMeta.ui, params, mydspPolyProcessor.parse_item1);

        // Possibly add effect parameters
        if (faustData.effectMeta) {
            mydspPolyProcessor.parse_ui(faustData.effectMeta.ui, params, mydspPolyProcessor.parse_item1);
        }
        return params;
    }

    static createMemory(buffer_size, polyphony_aux)
    {
        // Memory allocator
        var ptr_size = 4;
        var sample_size = 4;

        // Hack : at least 4 voices (to avoid weird wasm memory bug?)
        var polyphony = Math.max(4, polyphony_aux);

        function pow2limit(x)
        {
            var n = 65536; // Minimum = 64 kB
            while (n < x) { n = 2 * n; }
            return n;
        }

        // Keep JSON parsed object
        var json_object = null;
        try {
            json_object = faustData.dspMeta;
        } catch (e) {
            return null;
        }

        var effect_json_object_size = 0;
        if (faustData.effectMeta) {
            var effect_json_object = null;
            try {
                effect_json_object = faustData.effectMeta;
                effect_json_object_size = parseInt(effect_json_object.size);
            } catch (e) {
                faust.error_msg = "Error in JSON.parse: " + e;
                return null;
            }
        }

        var memory_size = pow2limit(effect_json_object_size + parseInt(json_object.size) * polyphony + ((parseInt(json_object.inputs) + parseInt(json_object.outputs) * 2) * (ptr_size + (buffer_size * sample_size)))) / 65536;
        memory_size = Math.max(2, memory_size); // As least 2
        return new WebAssembly.Memory({ initial: memory_size, maximum: memory_size });
    }

    constructor(options)
    {
        super(options);

        this.json_object = faustData.dspMeta;
        if (faustData.effectMeta) {
            this.effect_json_object = faustData.effectMeta;
        }

        this.output_handler = function(path, value) { this.port.postMessage({ path: path, value: value }); };

        this.debug = false;

        this.ins = null;
        this.outs = null;
        this.mixing = null;
        this.compute_handler = null;

        this.dspInChannnels = [];
        this.dspOutChannnels = [];

        this.fFreqLabel = [];
        this.fGateLabel = [];
        this.fGainLabel = [];
        this.fDate = 0;

        this.fPitchwheelLabel = [];
        this.fCtrlLabel = new Array(128);
        for (var i = 0; i < this.fCtrlLabel.length; i++) { this.fCtrlLabel[i] = []; }

        this.numIn = parseInt(this.json_object.inputs);
        this.numOut = parseInt(this.json_object.outputs);

        // Memory allocator
        this.ptr_size = 4;
        this.sample_size = 4;

        // Create the WASM memory
        var wasm_memory = mydspPolyProcessor.createMemory(mydspPolyProcessor.buffer_size, mydspPolyProcessor.polyphony);

        // Create the WASM mixer
        this.mixerObject = { imports: { print: arg => console.log(arg) } }
        this.mixerObject["memory"] = { "memory": wasm_memory };

        this.importObject = {
            env: {
                memoryBase: 0,
                tableBase: 0,

                // Integer version
                _abs: Math.abs,

                // Float version
                _acosf: Math.acos,
                _asinf: Math.asin,
                _atanf: Math.atan,
                _atan2f: Math.atan2,
                _ceilf: Math.ceil,
                _cosf: Math.cos,
                _expf: Math.exp,
                _floorf: Math.floor,
                _fmodf: function(x, y) { return x % y; },
                _logf: Math.log,
                _log10f: Math.log10,
                _max_f: Math.max,
                _min_f: Math.min,
                _remainderf: function(x, y) { return x - Math.round(x/y) * y; },
                _powf: Math.pow,
                _roundf: Math.fround,
                _sinf: Math.sin,
                _sqrtf: Math.sqrt,
                _tanf: Math.tan,

                // Double version
                _acos: Math.acos,
                _asin: Math.asin,
                _atan: Math.atan,
                _atan2: Math.atan2,
                _ceil: Math.ceil,
                _cos: Math.cos,
                _exp: Math.exp,
                _floor: Math.floor,
                _fmod: function(x, y) { return x % y; },
                _log: Math.log,
                _log10: Math.log10,
                _max_: Math.max,
                _min_: Math.min,
                _remainder:function(x, y) { return x - Math.round(x/y) * y; },
                _pow: Math.pow,
                _round: Math.fround,
                _sin: Math.sin,
                _sqrt: Math.sqrt,
                _tan: Math.tan,

                memory: wasm_memory,

                table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
            }
        };

        // wasm mixer
        this.mixer = new WebAssembly.Instance(mydspPolyProcessor.wasm_mixer_module, this.mixerObject).exports;

        // wasm instance
        this.factory = new WebAssembly.Instance(mydspPolyProcessor.wasm_module, this.importObject).exports;

        // wasm effect
        this.effect = (mydspPolyProcessor.wasm_effect_module) ? new WebAssembly.Instance(mydspPolyProcessor.wasm_effect_module, this.importObject).exports : null;

        this.HEAP = wasm_memory.buffer;
        this.HEAP32 = new Int32Array(this.HEAP);
        this.HEAPF32 = new Float32Array(this.HEAP);

        //console.log(this.HEAP);
        //console.log(this.HEAP32);
        //console.log(this.HEAPF32);

        // bargraph
        this.outputs_timer = 5;
        this.outputs_items = [];

        // input items
        this.inputs_items = [];

        // Start of HEAP index
        this.audio_heap_ptr = 0;

        // Setup pointers offset
        this.audio_heap_ptr_inputs = this.audio_heap_ptr;
        this.audio_heap_ptr_outputs = this.audio_heap_ptr_inputs + (this.numIn * this.ptr_size);
        this.audio_heap_ptr_mixing = this.audio_heap_ptr_outputs + (this.numOut * this.ptr_size);

        // Setup buffer offset
        this.audio_heap_inputs = this.audio_heap_ptr_mixing + (this.numOut * this.ptr_size);
        this.audio_heap_outputs = this.audio_heap_inputs + (this.numIn * mydspPolyProcessor.buffer_size * this.sample_size);
        this.audio_heap_mixing = this.audio_heap_outputs + (this.numOut * mydspPolyProcessor.buffer_size * this.sample_size);

        // Setup DSP voices offset
        this.dsp_start = this.audio_heap_mixing + (this.numOut * mydspPolyProcessor.buffer_size * this.sample_size);

        if (this.debug) {
            console.log(this.mixer);
            console.log(this.factory);
            console.log(this.effect);
        }

        // Start of DSP memory ('polyphony' DSP voices)
        this.polyphony = mydspPolyProcessor.polyphony;
        this.dsp_voices = [];
        this.dsp_voices_state = [];
        this.dsp_voices_level = [];
        this.dsp_voices_date = [];

        this.kActiveVoice = 0;
        this.kFreeVoice = -1;
        this.kReleaseVoice = -2;
        this.kNoVoice = -3;

        this.pathTable = [];

        // Allocate table for 'setParamValue'
        this.value_table = [];

        for (var i = 0; i <  this.polyphony; i++) {
            this.dsp_voices[i] = this.dsp_start + i * parseInt(this.json_object.size);
            this.dsp_voices_state[i] = this.kFreeVoice;
            this.dsp_voices_level[i] = 0;
            this.dsp_voices_date[i] = 0;
        }

        // Effect memory starts after last voice
        this.effect_start = this.dsp_voices[this.polyphony - 1] + parseInt(this.json_object.size);

        this.printMemory = function ()
        {
            console.log("============== Memory layout ==============");
            console.log("json_object.size: " + this.json_object.size);

            console.log("audio_heap_ptr: " + this.audio_heap_ptr);

            console.log("audio_heap_ptr_inputs: " + this.audio_heap_ptr_inputs);
            console.log("audio_heap_ptr_outputs: " + this.audio_heap_ptr_outputs);
            console.log("audio_heap_ptr_mixing: " + this.audio_heap_ptr_mixing);

            console.log("audio_heap_inputs: " + this.audio_heap_inputs);
            console.log("audio_heap_outputs: " + this.audio_heap_outputs);
            console.log("audio_heap_mixing: " + this.audio_heap_mixing);

            console.log("dsp_start: " + this.dsp_start);
            for (var i = 0; i <  this.polyphony; i++) {
                console.log("dsp_voices[i]: " + i + " " + this.dsp_voices[i]);
            }
            console.log("effect_start: " + this.effect_start);
        }

        this.getPlayingVoice = function(pitch)
        {
            var voice_playing = this.kNoVoice;
            var oldest_date_playing = Number.MAX_VALUE;

            for (var i = 0; i <  this.polyphony; i++) {
                if (this.dsp_voices_state[i] === pitch) {
                    // Keeps oldest playing voice
                    if (this.dsp_voices_date[i] < oldest_date_playing) {
                        oldest_date_playing = this.dsp_voices_date[i];
                        voice_playing = i;
                    }
                }
            }

            return voice_playing;
        }

        // Always returns a voice
        this.allocVoice = function(voice)
        {
            // so that envelop is always re-initialized
            this.factory.instanceClear(this.dsp_voices[voice]);
            this.dsp_voices_date[voice] = this.fDate++;
            this.dsp_voices_state[voice] = this.kActiveVoice;
            return voice;
        }

        this.getFreeVoice = function()
        {
            for (var i = 0; i <  this.polyphony; i++) {
                if (this.dsp_voices_state[i] === this.kFreeVoice) {
                    return this.allocVoice(i);
                }
            }

            var voice_release = this.kNoVoice;
            var voice_playing = this.kNoVoice;
            var oldest_date_release = Number.MAX_VALUE;
            var oldest_date_playing = Number.MAX_VALUE;

            // Scan all voices
            for (var i = 0; i <  this.polyphony; i++) {
                // Try to steal a voice in kReleaseVoice mode...
                if (this.dsp_voices_state[i] === this.kReleaseVoice) {
                    // Keeps oldest release voice
                    if (this.dsp_voices_date[i] < oldest_date_release) {
                        oldest_date_release = this.dsp_voices_date[i];
                        voice_release = i;
                    }
                } else {
                    if (this.dsp_voices_date[i] < oldest_date_playing) {
                        oldest_date_playing = this.dsp_voices_date[i];
                        voice_playing = i;
                    }
                }
            }

            // Then decide which one to steal
            if (oldest_date_release != Number.MAX_VALUE) {
                if (this.debug) {
                    console.log("Steal release voice : voice_date = %d cur_date = %d voice = %d", this.dsp_voices_date[voice_release], this.fDate, voice_release);
                }
                return this.allocVoice(voice_release);
            } else if (oldest_date_playing != Number.MAX_VALUE) {
                if (this.debug) {
                    console.log("Steal playing voice : voice_date = %d cur_date = %d voice = %d", this.dsp_voices_date[voice_playing], this.fDate, voice_playing);
                }
                return this.allocVoice(voice_playing);
            } else {
                return this.kNoVoice;
            }
        }

        this.update_outputs = function ()
        {
            if (this.outputs_items.length > 0 && this.output_handler && this.outputs_timer-- === 0) {
                this.outputs_timer = 5;
                for (var i = 0; i < this.outputs_items.length; i++) {
                    this.output_handler(this.outputs_items[i], this.factory.getParamValue(this.dsp, this.pathTable[this.outputs_items[i]]));
                }
            }
        }

        this.midiToFreq = function (note)
        {
            return 440.0 * Math.pow(2.0, (note - 69.0) / 12.0);
        }

        this.initAux = function ()
        {
            var i;

            if (this.numIn > 0) {
                this.ins = this.audio_heap_ptr_inputs;
                for (i = 0; i < this.numIn; i++) {
                    this.HEAP32[(this.ins >> 2) + i] = this.audio_heap_inputs + ((mydspPolyProcessor.buffer_size * this.sample_size) * i);
                }

                // Prepare Ins buffer tables
                var dspInChans = this.HEAP32.subarray(this.ins >> 2, (this.ins + this.numIn * this.ptr_size) >> 2);
                for (i = 0; i < this.numIn; i++) {
                    this.dspInChannnels[i] = this.HEAPF32.subarray(dspInChans[i] >> 2, (dspInChans[i] + mydspPolyProcessor.buffer_size * this.sample_size) >> 2);
                }
            }

            if (this.numOut > 0) {
                // allocate memory for output and mixing arrays
                this.outs = this.audio_heap_ptr_outputs;
                this.mixing = this.audio_heap_ptr_mixing;

                for (i = 0; i < this.numOut; i++) {
                    this.HEAP32[(this.outs >> 2) + i] = this.audio_heap_outputs + ((mydspPolyProcessor.buffer_size * this.sample_size) * i);
                    this.HEAP32[(this.mixing >> 2) + i] = this.audio_heap_mixing + ((mydspPolyProcessor.buffer_size * this.sample_size) * i);
                }

                // Prepare Out buffer tables
                var dspOutChans = this.HEAP32.subarray(this.outs >> 2, (this.outs + this.numOut * this.ptr_size) >> 2);
                for (i = 0; i < this.numOut; i++) {
                    this.dspOutChannnels[i] = this.HEAPF32.subarray(dspOutChans[i] >> 2, (dspOutChans[i] + mydspPolyProcessor.buffer_size * this.sample_size) >> 2);
                }
            }

            // Parse UI
            mydspPolyProcessor.parse_ui(this.json_object.ui, this, mydspPolyProcessor.parse_item2);

            if (this.effect) {
                mydspPolyProcessor.parse_ui(this.effect_json_object.ui, this, mydspPolyProcessor.parse_item2);
            }

            // keep 'keyOn/keyOff' labels
            for (i = 0; i < this.inputs_items.length; i++) {
                if (this.inputs_items[i].endsWith("/gate")) {
                    this.fGateLabel.push(this.pathTable[this.inputs_items[i]]);
                } else if (this.inputs_items[i].endsWith("/freq")) {
                    this.fFreqLabel.push(this.pathTable[this.inputs_items[i]]);
                } else if (this.inputs_items[i].endsWith("/gain")) {
                    this.fGainLabel.push(this.pathTable[this.inputs_items[i]]);
                }
            }

            // Init DSP voices
            for (i = 0; i <  this.polyphony; i++) {
                this.factory.init(this.dsp_voices[i], sampleRate);  // 'sampleRate' is defined in AudioWorkletGlobalScope
            }

            // Init effect
            if (this.effect) {
                this.effect.init(this.effect_start, sampleRate);
            }

            // Print memory layout
            this.printMemory();
        }

        this.keyOn = function (channel, pitch, velocity)
        {
            var voice = this.getFreeVoice();
            if (this.debug) {
                console.log("keyOn voice %d", voice);
            }
            for (var i = 0; i < this.fFreqLabel.length; i++) {
                this.factory.setParamValue(this.dsp_voices[voice], this.fFreqLabel[i], this.midiToFreq(pitch));
            }
            for (var i = 0; i < this.fGateLabel.length; i++) {
                this.factory.setParamValue(this.dsp_voices[voice], this.fGateLabel[i], 1.0);
               }
            for (var i = 0; i < this.fGainLabel.length; i++) {
                this.factory.setParamValue(this.dsp_voices[voice], this.fGainLabel[i], velocity/127.);
            }
            this.dsp_voices_state[voice] = pitch;
        }

        this.keyOff = function (channel, pitch, velocity)
        {
            var voice = this.getPlayingVoice(pitch);
            if (voice !== this.kNoVoice) {
                // No use of velocity for now...
                for (var i = 0; i < this.fGateLabel.length; i++) {
                    this.factory.setParamValue(this.dsp_voices[voice], this.fGateLabel[i], 0.0);
                }
                // Release voice
                this.dsp_voices_state[voice] = this.kReleaseVoice;
            } else {
                if (this.debug) {
                    console.log("Playing voice not found...");
                }
            }
        }

        this.allNotesOff = function ()
        {
            for (var i = 0; i <  this.polyphony; i++) {
                for (var j = 0; j < this.fGateLabel.length; j++) {
                    this.factory.setParamValue(this.dsp_voices[i], this.fGateLabel[j], 0.0);
                }
                this.dsp_voices_state[i] = this.kReleaseVoice;
            }
        }

        this.ctrlChange = function (channel, ctrl, value)
        {
            if (ctrl === 123 || ctrl === 120) {
                this.allNotesOff();
            }

            if (this.fCtrlLabel[ctrl] !== []) {
                for (var i = 0; i < this.fCtrlLabel[ctrl].length; i++) {
                    var path = this.fCtrlLabel[ctrl][i].path;
                    this.setParamValue(path, mydspPolyProcessor.remap(value, 0, 127, this.fCtrlLabel[ctrl][i].min, this.fCtrlLabel[ctrl][i].max));
                    if (this.output_handler) {
                        this.output_handler(path, this.getParamValue(path));
                    }
                }
            }
        }

        this.pitchWheel = function (channel, wheel)
        {
            for (var i = 0; i < this.fPitchwheelLabel.length; i++) {
                var path = this.fPitchwheelLabel[i];
                this.setParamValue(path, Math.pow(2.0, wheel/12.0));
                if (this.output_handler) {
                    this.output_handler(path, this.getParamValue(path));
                }
            }
        }

        this.setParamValue = function (path, val)
        {
            if (this.effect && JSON.stringify(faustData.effectMeta).includes(path)) {
                this.effect.setParamValue(this.effect_start, this.pathTable[path], val);
            } else {
                for (var i = 0; i < this.polyphony; i++) {
                    this.factory.setParamValue(this.dsp_voices[i], this.pathTable[path], val);
                }
            }

        }

        this.getParamValue = function (path)
        {
            if (this.effect && JSON.stringify(faustData.effectMeta).includes(path)) {
                return this.effect.getParamValue(this.effect_start, this.pathTable[path]);
            } else {
                return this.factory.getParamValue(this.dsp_voices[0], this.pathTable[path]);
            }
        }

        // Init resulting DSP
        this.initAux();

        // Set message handler
        this.port.onmessage = this.handleMessage;
    }

    handleMessage = (event) => { // use arrow function for binding
        const msg = event.data;
        switch (msg.type) {
            // Generic MIDI message
            case "midi": this.midiMessage(msg.data); break;
            // Typed MIDI message
            case "keyOn": this.keyOn(msg.data[0], msg.data[1], msg.data[2]); break;
            case "keyOff": this.keyOff(msg.data[0], msg.data[1], msg.data[2]); break;
            case "ctrlChange": this.ctrlChange(msg.data[0], msg.data[1], msg.data[2]); break;
            case "pitchWheel": this.pitchWheel(msg.data[0], msg.data[1]); break;
            // Generic data message
            case "param": this.setParamValue(msg.key, msg.value); break;
            // case "patch": this.onpatch(msg.data); break;
        }
    }

    midiMessage(data)
    {
        var cmd = data[0] >> 4;
        var channel = data[0] & 0xf;
        var data1 = data[1];
        var data2 = data[2];

        if (channel === 9) {
            return;
        } else if (cmd === 8 || ((cmd === 9) && (data2 === 0))) {
            this.keyOff(channel, data1, data2);
        } else if (cmd === 9) {
            this.keyOn(channel, data1, data2);
        } else if (cmd === 11) {
            this.ctrlChange(channel, data1, data2);
        } else if (cmd === 14) {
            this.pitchWheel(channel, ((data2 * 128.0 + data1)-8192)/8192.0);
        }
    }

    process(inputs, outputs, parameters)
    {
        var input = inputs[0];
        var output = outputs[0];

        // Check inputs
        if (this.numIn > 0 && ((input === undefined) || (input[0].length === 0))) {
            //console.log("Process input error");
            return true;
        }
        // Check outputs
        if (this.numOut > 0 && ((output === undefined) || (output[0].length === 0))) {
            //console.log("Process output error");
            return true;
        }

        // Copy inputs
        if (input !== undefined) {
            for (var chan = 0; chan < Math.min(this.numIn, input.length) ; ++chan) {
                var dspInput = this.dspInChannnels[chan];
                dspInput.set(input[chan]);
            }
        }


        // Update controls (possibly needed for sample accurate control)
        var params = Object.entries(parameters);
        for (var i = 0; i < params.length; i++) {
            this.HEAPF32[this.pathTable[params[i][0]] >> 2] = params[i][1][0];
        }

        // Possibly call an externally given callback (for instance to synchronize playing a MIDIFile...)
        if (this.compute_handler) {
            this.compute_handler(mydspPolyProcessor.buffer_size);
        }

        // First clear the outputs
        this.mixer.clearOutput(mydspPolyProcessor.buffer_size, this.numOut, this.outs);
        // Compute all running voices
        for (var i = 0; i < this.polyphony; i++) {
            if (this.dsp_voices_state[i] != this.kFreeVoice) {
                // Compute voice
                this.factory.compute(this.dsp_voices[i], mydspPolyProcessor.buffer_size, this.ins, this.mixing);
                // Mix it in result
                this.dsp_voices_level[i] = this.mixer.mixVoice(mydspPolyProcessor.buffer_size, this.numOut, this.mixing, this.outs);
                // Check the level to possibly set the voice in kFreeVoice again
                if ((this.dsp_voices_level[i] < 0.0005) && (this.dsp_voices_state[i] === this.kReleaseVoice)) {
                    this.dsp_voices_state[i] = this.kFreeVoice;
                }
            }
        }

        // Apply effect
        if (this.effect) {
            this.effect.compute(this.effect_start, mydspPolyProcessor.buffer_size, this.outs, this.outs);
        }

        // Update bargraph
        this.update_outputs();

        // Copy outputs
        if (output !== undefined) {
            for (var chan = 0; chan < Math.min(this.numOut, output.length); ++chan) {
                var dspOutput = this.dspOutChannnels[chan];
                output[chan].set(dspOutput);
            }
        }

        return true;
    }
}

// Globals

mydspPolyProcessor.buffer_size = 128;
mydspPolyProcessor.polyphony = MAX_POLYPHONY;

// Synchronously compile the WASM modules
try {
    mydspPolyProcessor.wasm_mixer_module = new WebAssembly.Module(mydspPolyProcessor.atob(getBase64Mixer()));
    mydspPolyProcessor.wasm_module = new WebAssembly.Module(mydspPolyProcessor.atob(getBase64Codemydsp()));
    // Possibly compile effect
    if (getBase64Codeeffect()) {
        mydspPolyProcessor.wasm_effect_module = new WebAssembly.Module(mydspPolyProcessor.atob(getBase64Codeeffect()));
    }
    console.log(faustData.name);
    registerProcessor(faustData.name, mydspPolyProcessor);
} catch (e) {
    console.log(e); console.log("Faust mydspPoly cannot be loaded or compiled");
}
`;
