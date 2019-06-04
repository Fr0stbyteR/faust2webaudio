/* eslint-disable no-console */
import sha1 from "crypto-libraries/sha1";
import { LibFaustLoader, LibFaust } from "./LibFaustLoader";
import { FaustWasmToScriptProcessor } from "./FaustWasmToScriptProcessor";
import { FaustAudioWorkletProcessorWrapper } from "./FaustAudioWorkletProcessor";
import { FaustAudioWorkletNode } from "./FaustAudioWorkletNode";

import * as utils from "./utils";
import { FaustOfflineProcessor } from "./FaustOfflineProcessor";
import { TCompiledDsp, TFaustCompileOptions, FaustScriptProcessorNode, TFaustCompileArgs, TCompiledCode, TCompiledCodes, TAudioNodeOptions, TCompiledStrCodes } from "./types";
import { LibFaustWorkerWrapper } from "./LibFaustWorker";

// import * as Binaryen from "binaryen";

/**
 * Main Faust class,
 * usage: `new Faust().ready.then(faust => any);`
 *
 * @export
 * @class Faust
 */
export class Faust {
    private libFaust: LibFaustWorkerWrapper;
    /**
     * Debug mode, set to true to print out each message
     *
     * @type {boolean}
     * @memberof Faust
     */
    debug: boolean = false;
    /**
     * An object to storage compiled dsp with it's sha1
     *
     * @private
     * @type {{ [shaKey: string]: TCompiledDsp }}
     * @memberof Faust
     */
    private dspTable: { [shaKey: string]: TCompiledDsp } = {};
    /**
     * Registered WorkletProcessor names
     *
     * @private
     * @type {string[]}
     * @memberof Faust
     */
    private workletProcessors: string[] = [];
    private _log: string[] = [];
    /**
     * Offline processor used to plot
     *
     * @private
     * @type {FaustOfflineProcessor}
     * @memberof Faust
     */
    private offlineProcessor: FaustOfflineProcessor = new FaustOfflineProcessor();

    /**
     * Creates an instance of Faust
     * usage: `new Faust().ready.then(faust => any);`
     *
     * @param {{ debug: boolean; }} [options]
     * @memberof Faust
     */
    constructor(options?: { debug: boolean }) {
        this.debug = !!(options && options.debug);
        this.libFaust = new LibFaustWorkerWrapper();
    }
    /**
     * A promise to resolve when libfaust is ready.
     *
     * @readonly
     * @type {Promise<Faust>}
     * @memberof Faust
     */
    get ready(): Promise<Faust> {
        return this.libFaust.ready.then(() => this);
    }
    /**
     * Create a AudioNode from dsp source code with options.
     *
     * @param {string} code - the source code
     * @param {TFaustCompileOptions} optionsIn - options with audioCtx, bufferSize, voices, useWorklet, args, plot and plotHandler
     * @returns {Promise<FaustAudioWorkletNode | FaustScriptProcessorNode>}
     * @memberof Faust
     */
    async getNode(code: string, optionsIn: TFaustCompileOptions): Promise<FaustAudioWorkletNode | FaustScriptProcessorNode> {
        const { audioCtx, voices, useWorklet, bufferSize, plotHandler } = optionsIn;
        const argv = [] as string[];
        for (const key in optionsIn.args) {
            argv.push(key);
            argv.push(optionsIn.args[key]);
        }
        const compiledDsp = await this.compileCodes(code, argv, !voices);
        if (!compiledDsp) return null;
        const options = { compiledDsp, audioCtx, voices, plotHandler, bufferSize: useWorklet ? 128 : bufferSize };
        const node = await useWorklet ? this.getAudioWorkletNode(options) : this.getScriptProcessorNode(options);
        return node;
    }
    /**
     * Plot a dsp offline.
     *
     * @param {{ code?: string; size?: number; sampleRate?: number; args?: TFaustCompileArgs }} [options]
     * @returns {Promise<Float32Array[]>}
     * @memberof Faust
     */
    async plot(options?: { code?: string; size?: number; sampleRate?: number; args?: TFaustCompileArgs }): Promise<Float32Array[]> {
        let compiledDsp;
        const argv = [] as string[];
        for (const key in options.args) {
            argv.push(key);
            argv.push(options.args[key]);
        }
        if (options.code) {
            compiledDsp = await this.compileCodes(options.code, argv, true);
            if (!compiledDsp) return null;
        }
        return this.offlineProcessor.plot({ compiledDsp, ...options });
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
    private async compileCode(factoryName: string, code: string, argvIn: string[], internalMemory: boolean): Promise<TCompiledCode> {
        const codeSize = await this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = await this.libFaust._malloc(codeSize);
        const name = "FaustDSP";
        const nameSize = await this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = await this.libFaust._malloc(nameSize);
        const $errorMsg = await this.libFaust._malloc(4096);

        await this.libFaust.stringToUTF8(name, $name, nameSize);
        await this.libFaust.stringToUTF8(code, $code, codeSize);

        // Add 'cn' option with the factory name
        const argv = argvIn || [];
        argv.push("-cn", factoryName);

        // Prepare 'argv_aux' array for C side
        const ptrSize = 4;
        const $argv = await this.libFaust._malloc(argv.length * ptrSize); // Get buffer from emscripten.
        let argvBuffer$ = new Int32Array((await this.libFaust.HEAP32).buffer, $argv, argv.length); // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argv.length; i++) {
            const size$arg = await this.libFaust.lengthBytesUTF8(argv[i]) + 1;
            const $arg = await this.libFaust._malloc(size$arg);
            await this.libFaust.stringToUTF8(argv[i], $arg, size$arg);
            argvBuffer$[i] = $arg;
        }
        try {
            const time1 = performance.now();
            const $moduleCode = await this.libFaust.createWasmCDSPFactoryFromString($name, $code, argv.length, $argv, $errorMsg, internalMemory);
            const time2 = performance.now();
            this.log("Faust compilation duration : " + (time2 - time1));
            const errorMsg = await this.libFaust.UTF8ToString($errorMsg);
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
            const $compiledCode = await this.libFaust.getWasmCModule($moduleCode);
            const compiledCodeSize = await this.libFaust.getWasmCModuleSize($moduleCode);
            // Copy native 'binary' string in JavaScript Uint8Array
            const ui8Code = new Uint8Array(compiledCodeSize);
            const heap8 = await this.libFaust.HEAP8;
            for (let i = 0; i < compiledCodeSize; i++) {
                // faster than 'getValue' which gets the type of access for each read...
                ui8Code[i] = heap8[$compiledCode + i];
            }
            const $helpersCode = await this.libFaust.getWasmCHelpers($moduleCode);
            const helpersCode = await this.libFaust.UTF8ToString($helpersCode);
            // Free strings
            await this.libFaust._free($code);
            await this.libFaust._free($name);
            await this.libFaust._free($errorMsg);
            // Free C allocated wasm module
            await this.libFaust.freeWasmCModule($moduleCode);
            // Get an updated integer view on the newly allocated buffer after possible emscripten memory grow
            argvBuffer$ = new Int32Array((await this.libFaust.HEAP32).buffer, $argv, argv.length);
            // Free 'argv' C side array
            for (let i = 0; i < argv.length; i++) {
                await this.libFaust._free(argvBuffer$[i]);
            }
            await this.libFaust._free($argv);
            return { ui8Code, code, helpersCode };
        } catch (e) {
            // libfaust is compiled without C++ exception activated, so a JS exception is throwed and catched here
            let errorMsg = await this.libFaust.UTF8ToString(await this.libFaust.getErrorAfterException());
            // Report the Emscripten error
            if (!errorMsg) errorMsg = e;
            this.libFaust.cleanupAfterException();
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
            this.log("Existing library : " + shaKey);
            // Existing factory, do not create it...
            return compiledDsp;
        }
        this.log("libfaust.js version : " + await this.libFaust.getLibFaustVersion());
        // Create 'effect' expression
        const effectCode = `adapt(1,1) = _; adapt(2,2) = _,_; adapt(1,2) = _ <: _,_; adapt(2,1) = _,_ :> _;
adaptor(F,G) = adapt(outputs(F),inputs(G));
dsp_code = environment{${code}};
process = adaptor(dsp_code.process, dsp_code.effect) : dsp_code.effect;`;
        const dspCompiledCode = await this.compileCode(shaKey, code, argv, internalMemory);
        let effectCompiledCode: TCompiledCode;
        try {
            effectCompiledCode = await this.compileCode(shaKey + "_", effectCode, argv, internalMemory);
        } catch (e) {} // eslint-disable-line no-empty
        const compiledCodes = { dsp: dspCompiledCode, effect: effectCompiledCode };
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
    private async expandCode(code: string, argvIn: string[]): Promise<string> {
        this.log("libfaust.js version : " + await this.libFaust.getLibFaustVersion());
        // Allocate strings on the HEAP
        const codeSize = await this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = await this.libFaust._malloc(codeSize);

        const name = "FaustDSP";
        const nameSize = await this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = await this.libFaust._malloc(nameSize);

        const $shaKey = await this.libFaust._malloc(64);
        const $errorMsg = await this.libFaust._malloc(4096);

        await this.libFaust.stringToUTF8(name, $name, nameSize);
        await this.libFaust.stringToUTF8(code, $code, codeSize);

        const argv = argvIn || [];
        // Force "wasm" compilation
        argv.push("-lang");
        argv.push("wasm");

        // Prepare 'argv' array for C side
        const ptrSize = 4;
        const $argv = await this.libFaust._malloc(argv.length * ptrSize); // Get buffer from emscripten.
        let argvBuffer$ = new Int32Array((await this.libFaust.HEAP32).buffer, $argv, argv.length); // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argv.length; i++) {
            const size$arg = await this.libFaust.lengthBytesUTF8(argv[i]) + 1;
            const $arg = await this.libFaust._malloc(size$arg);
            await this.libFaust.stringToUTF8(argv[i], $arg, size$arg);
            argvBuffer$[i] = $arg;
        }
        try {
            const $expandedCode = await this.libFaust.expandCDSPFromString($name, $code, argv.length, $argv, $shaKey, $errorMsg);
            const expandedCode = await this.libFaust.UTF8ToString($expandedCode);
            const errorMsg = await this.libFaust.UTF8ToString($errorMsg);
            if (errorMsg) this.error(errorMsg);
            // Free strings
            await this.libFaust._free($code);
            await this.libFaust._free($name);
            await this.libFaust._free($shaKey);
            await this.libFaust._free($errorMsg);
            // Free C allocated expanded string
            await this.libFaust.freeCMemory($expandedCode);
            // Get an updated integer view on the newly allocated buffer after possible emscripten memory grow
            argvBuffer$ = new Int32Array((await this.libFaust.HEAP32).buffer, $argv, argv.length);
            // Free 'argv' C side array
            for (let i = 0; i < argv.length; i++) {
                await this.libFaust._free(argvBuffer$[i]);
            }
            await this.libFaust._free($argv);
            return expandedCode;
        } catch (e) {
            // libfaust is compiled without C++ exception activated, so a JS exception is throwed and catched here
            let errorMsg = await this.libFaust.UTF8ToString(await this.libFaust.getErrorAfterException());
            // Report the Emscripten error
            if (!errorMsg) errorMsg = e;
            await this.libFaust.cleanupAfterException();
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
            throw new Error("Faust DSP factory cannot be compiled");
        }
        const time2 = performance.now();
        this.log("WASM compilation duration : " + (time2 - time1));
        const compiledDsp: TCompiledDsp = { shaKey, codes, dspModule, dspMeta: undefined }; // Default mode
        // 'libfaust.js' wasm backend generates UI methods, then we compile the code
        // eval(helpers_code1);
        // factory.getJSON = eval("getJSON" + dspName);
        // factory.getBase64Code = eval("getBase64Code" + dspName);
        try {
            const json = codes.dsp.helpersCode.match(/getJSON\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*'(\{.+?)';}/)[1].replace(/\\'/g, "'");
            // const base64Code = codes.dsp.helpersCode.match(/getBase64Code\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*"([A-Za-z0-9+/=]+?)";[\s\n]+}/)[1];
            const meta = JSON.parse(json);
            compiledDsp.dspMeta = meta;
        } catch (e) {
            this.error("Error in JSON.parse: " + e);
            throw e;
        }
        this.dspTable[shaKey] = compiledDsp;
        // Possibly compile effect
        if (!codes.effect) return compiledDsp;
        try {
            const effectModule = await WebAssembly.compile(codes.effect.ui8Code);
            compiledDsp.effectModule = effectModule;
            // 'libfaust.js' wasm backend generates UI methods, then we compile the code
            // eval(helpers_code2);
            // factory.getJSONeffect = eval("getJSON" + factory_name2);
            // factory.getBase64Codeeffect = eval("getBase64Code" + factory_name2);
            try {
                const json = codes.effect.helpersCode.match(/getJSON\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*'(\{.+?)';}/)[1].replace(/\\'/g, "'");
                // const base64Code = codes.effect.helpersCode.match(/getBase64Code\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*"([A-Za-z0-9+/=]+?)";[\s\n]+}/)[1];
                const meta = JSON.parse(json);
                compiledDsp.effectMeta = meta;
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
     * @param {TAudioNodeOptions} optionsIn
     * @returns {Promise<FaustScriptProcessorNode>}
     * @memberof Faust
     */
    private async getScriptProcessorNode(optionsIn: TAudioNodeOptions): Promise<FaustScriptProcessorNode> {
        return new FaustWasmToScriptProcessor(this).getNode(optionsIn);
    }
    // deleteDSPInstance() {}
    /**
     * Get a AudioWorkletNode from compiled dsp
     *
     * @private
     * @param {TAudioNodeOptions} optionsIn
     * @returns {Promise<FaustAudioWorkletNode>}
     * @memberof Faust
     */
    private async getAudioWorkletNode(optionsIn: TAudioNodeOptions): Promise<FaustAudioWorkletNode> {
        const { compiledDsp: compiledDspWithCodes, audioCtx, voices, plotHandler } = optionsIn;
        const compiledDsp = { ...compiledDspWithCodes };
        delete compiledDsp.codes;
        const id = compiledDsp.shaKey + "_" + voices;
        if (this.workletProcessors.indexOf(id) === -1) {
            const strProcessor = `
const faustData = ${JSON.stringify({
        id,
        dspMeta: compiledDsp.dspMeta,
        effectMeta: compiledDsp.effectMeta
    })};
(${FaustAudioWorkletProcessorWrapper.toString()})();
`;
            const url = window.URL.createObjectURL(new Blob([strProcessor], { type: "text/javascript" }));
            await audioCtx.audioWorklet.addModule(url);
            this.workletProcessors.push(id);
        }
        return new FaustAudioWorkletNode({ audioCtx, id, voices, compiledDsp, plotHandler, mixer32Module: utils.mixer32Module });
    }
    /**
     * Remove a DSP from registry
     *
     * @private
     * @param {TCompiledDsp} compiledDsp
     * @memberof Faust
     */
    private async deleteDsp(compiledDsp: TCompiledDsp): Promise<void> {
        // The JS side is cleared
        delete this.dspTable[compiledDsp.shaKey];
        // The native C++ is cleared each time (freeWasmCModule has been already called in faust.compile)
        await this.libFaust.deleteAllWasmCDSPFactories();
    }
    /**
     * Stringify current storaged DSP Table.
     *
     * @returns {string}
     * @memberof Faust
     */
    stringifyDspTable(): string {
        const strTable: { [shaKey: string]: TCompiledStrCodes } = {};
        for (const key in this.dspTable) {
            const { codes } = this.dspTable[key];
            strTable[key] = {
                dsp: {
                    strCode: btoa(utils.ab2str(codes.dsp.ui8Code)),
                    code: codes.dsp.code,
                    helpersCode: codes.dsp.helpersCode
                },
                effect: codes.effect ? {
                    strCode: btoa(utils.ab2str(codes.effect.ui8Code)),
                    code: codes.effect.code,
                    helpersCode: codes.effect.helpersCode
                } : undefined
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
    parseDspTable(str: string) {
        const strTable = JSON.parse(str) as { [shaKey: string]: TCompiledStrCodes };
        for (const shaKey in strTable) {
            if (this.dspTable[shaKey]) continue;
            const strCodes = strTable[shaKey];
            const compiledCodes: TCompiledCodes = {
                dsp: {
                    ui8Code: utils.str2ab(atob(strCodes.dsp.strCode)),
                    code: strCodes.dsp.code,
                    helpersCode: strCodes.dsp.helpersCode
                },
                effect: strCodes.effect ? {
                    ui8Code: utils.str2ab(atob(strCodes.effect.strCode)),
                    code: strCodes.effect.code,
                    helpersCode: strCodes.effect.helpersCode
                } : undefined
            };
            this.compileDsp(compiledCodes, shaKey).then(dsp => this.dspTable[shaKey] = dsp);
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
    async getDiagram(code: string, argvIn: string[]): Promise<string> {
        const codeSize = await this.libFaust.lengthBytesUTF8(code) + 1;
        const $code = await this.libFaust._malloc(codeSize);
        const name = "FaustDSP";
        const nameSize = await this.libFaust.lengthBytesUTF8(name) + 1;
        const $name = await this.libFaust._malloc(nameSize);
        const $errorMsg = await this.libFaust._malloc(4096);

        const argv = [...argvIn, "-lang", "wast", "-o", "/dev/null", "-svg"];
        await this.libFaust.stringToUTF8(name, $name, nameSize);
        await this.libFaust.stringToUTF8(code, $code, codeSize);

        // Prepare 'argv' array for C side
        const ptrSize = 4;
        const $argv = await this.libFaust._malloc(argv.length * ptrSize); // Get buffer from emscripten.
        let argvBuffer$ = new Int32Array((await this.libFaust.HEAP32).buffer, $argv, argv.length); // Get a integer view on the newly allocated buffer.
        for (let i = 0; i < argv.length; i++) {
            const size$arg = await this.libFaust.lengthBytesUTF8(argv[i]) + 1;
            const $arg = await this.libFaust._malloc(size$arg);
            await this.libFaust.stringToUTF8(argv[i], $arg, size$arg);
            argvBuffer$[i] = $arg;
        }
        try {
            await this.libFaust.generateCAuxFilesFromString($name, $code, argv.length, $argv, $errorMsg);
            // Free strings
            await this.libFaust._free($code);
            await this.libFaust._free($name);
            await this.libFaust._free($errorMsg);
            // Get an updated integer view on the newly allocated buffer after possible emscripten memory grow
            argvBuffer$ = new Int32Array((await this.libFaust.HEAP32).buffer, $argv, argv.length);
            // Free 'argv' C side array
            for (let i = 0; i < argv.length; i++) {
                await this.libFaust._free(argvBuffer$[i]);
            }
            await this.libFaust._free($argv);
        } catch (e) {
            // libfaust is compiled without C++ exception activated, so a JS exception is throwed and catched here
            let errorMsg = await this.libFaust.UTF8ToString(await this.libFaust.getErrorAfterException());
            // Report the Emscripten error
            if (!errorMsg) errorMsg = e;
            await this.libFaust.cleanupAfterException();
            throw errorMsg;
        }
        return this.libFaust.readFile("FaustDSP-svg/process.svg", { encoding: "utf8" });
    }
    log(...args: any[]) {
        if (this.debug) console.log(...args);
        const msg = args.length === 1 && typeof args[0] === "string" ? args[0] : JSON.stringify(args.length !== 1 ? args : args[0]);
        this._log.push(msg);
        if (typeof this.logHandler === "function") this.logHandler(msg, 0);
    }
    error(...args: any[]) {
        console.error(...args);
        const msg = args.length === 1 && typeof args[0] === "string" ? args[0] : JSON.stringify(args.length !== 1 ? args : args[0]);
        this._log.push(msg);
        if (typeof this.logHandler === "function") this.logHandler(msg, 1);
    }
    logHandler: (msg: string, errorLevel: 1 | 0) => any;
}
