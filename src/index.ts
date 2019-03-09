import { LibFaustLoader, LibFaust } from "libfaust-wasm";
import sha1Js from "crypto-libraries/sha1.js";
import * as Binaryen from "binaryen";
const Sha1 = sha1Js;
class Faust {
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
    static ab2str(buf: ArrayBuffer): string {
        return buf ? String.fromCharCode.apply(null, new Uint8Array(buf)) : null;
    }
    static str2ab(str: string) {
        if (!str) return null;
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }
    debug = false;
    factory_number = 0;
    factory_table = {} as { [key: string]: TCompiledDsp };
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
    compileCode(factoryName: string, code: string, argv: string[], internalMemory: boolean) {
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
            this.error(errorMsg);
            this.cleanupAfterException();
            return null;
        }
    }
    createDSPFactoryAux(code: string, argv: string[], internalMemory: boolean, callback: (...args: any) => any) {
        // Code memory type and argv in the SHAKey to differentiate compilation flags and Monophonic and Polyphonic factories
        const strArgv = argv.join("");
        const shaKey = Sha1.hash(code + (internalMemory ? "internal_memory" : "external_memory") + strArgv, { msgFormat: "string" });
        const compiledDsp = this.factory_table[shaKey];
        if (compiledDsp) {
            this.log("Existing library : " + compiledDsp.codes.dspName);
            // Existing factory, do not create it...
            return callback(compiledDsp);
        }
        this.log("libfaust.js version : " + this.getLibFaustVersion());

        // Factory name for DSP and effect
        const dspName = "mydsp" + this.factory_number;
        const effectName = "effect" + this.factory_number++;

        // Create 'effect' expression
        const effectCode = "adapt(1,1) = _; adapt(2,2) = _,_; adapt(1,2) = _ <: _,_; adapt(2,1) = _,_ :> _; "
            + "adaptor(F,G) = adapt(outputs(F),inputs(G));"
            + "dsp_code = environment{" + code + "};"
            + "process = adaptor(dsp_code.process, dsp_code.effect) : dsp_code.effect;";

        const dspCompiledCode = this.compileCode(dspName, code, argv, internalMemory);

        if (!dspCompiledCode) return callback(null);
        const effectCompiledCode = this.compileCode(effectName, effectCode, argv, internalMemory);
        const compiledCodes = { dspName, effectName, dsp: dspCompiledCode, effect: effectCompiledCode } as TCompiledCodes;
        return this.readDSPFactoryFromMachineAux(compiledCodes, shaKey, callback);
    }
    /**
     * Create a DSP factory from source code as a string to be used to create 'monophonic' DSP
     *
     * @param {string} code - the source code as a string
     * @param {string[]} argv - an array of parameters to be given to the Faust compiler
     * @param {(...args: any) => any} callback - a callback taking the created DSP factory as parameter, or null in case of error
     * @memberof Faust
     */
    createDSPFactory(code: string, argv: string[], callback: (...args: any) => any) {
        return this.createDSPFactoryAux(code, argv, true, callback);
    }
    /**
     * Create a DSP factory from source code as a string to be used to create 'polyphonic' DSP
     *
     * @param {string} code - the source code as a string
     * @param {string[]} argv - an array of parameters to be given to the Faust compiler
     * @param {(...args: any) => any} callback - a callback taking the created DSP factory as parameter, or null in case of error
     * @memberof Faust
     */
    createPolyDSPFactory(code: string, argv: string[], callback: (...args: any) => any) {
        return this.createDSPFactoryAux(code, argv, false, callback);
    }
    /**
     * From a DSP source file, creates a 'self-contained' DSP source string where all needed librairies have been included.
     * All compilations options are 'normalized' and included as a comment in the expanded string.
     *
     * @param {string} code - the source code as a string
     * @param {string[]} argv - and array of paramaters to be given to the Faust compiler
     * @returns {string} the expanded DSP as a string (possibly empty).
     * @memberof Faust
     */
    expandDSP(code: string, argvIn: string[]) {
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
            const $expandDsp = this.expandCDSPFromString($name, $code, argv.length, $argv, $shaKey, $errorMsg);
            const expandDsp = this.libFaust.UTF8ToString($expandDsp);
            const shaKey = this.libFaust.UTF8ToString($shaKey);
            const errorMsg = this.libFaust.UTF8ToString($errorMsg);
            if (errorMsg) this.error(errorMsg);

            // Free strings
            this.libFaust._free($code);
            this.libFaust._free($name);
            this.libFaust._free($shaKey);
            this.libFaust._free($errorMsg);

            // Free C allocated expanded string
            this.freeCMemory($expandDsp);

            // Get an updated integer view on the newly allocated buffer after possible emscripten memory grow
            $argv_buffer = new Int32Array(this.libFaust.HEAP32.buffer, $argv, argv.length);
            // Free 'argv' C side array
            for (let i = 0; i < argv.length; i++) {
                this.libFaust._free($argv_buffer[i]);
            }
            this.libFaust._free($argv);

            return expandDsp;

        } catch (e) {
            // libfaust is compiled without C++ exception activated, so a JS exception is throwed and catched here
            let errorMsg = this.libFaust.UTF8ToString(this.getErrorAfterException());
            // Report the Emscripten error
            if (!errorMsg) errorMsg = e;
            this.error(errorMsg);
            this.cleanupAfterException();
            return null;
        }
    }
    writeDSPFactoryToMachine(compiledCodes: TCompiledCodes) {
        return {
            dspName: compiledCodes.dspName,
            dsp: {
                strCode: Faust.ab2str(compiledCodes.dsp.ui8Code),
                code: compiledCodes.dsp.code,
                helpersCode: compiledCodes.dsp.helpersCode
            },
            effectName : compiledCodes.effectName,
            effect: {
                strCode: Faust.ab2str(compiledCodes.effect.ui8Code),
                code: compiledCodes.effect.code,
                helpersCode: compiledCodes.effect.helpersCode
            }
        } as TCompiledStrCodes;
    }
    readDSPFactoryFromMachine(compiledStrCodes: TCompiledStrCodes, callback: (compiledDsp: TCompiledDsp) => any) {
        const shaKey = Sha1.hash(compiledStrCodes.dsp.code, { msgFormat: "string" });
        const compiledDsp = this.factory_table[shaKey];
        if (compiledDsp) {
            this.log("Existing library : " + compiledDsp.codes.dspName);
            // Existing factory, do not create it...
            callback(compiledDsp);
        } else {
            const compiledCodes = {
                dspName: compiledStrCodes.dspName,
                effectName: compiledStrCodes.effectName,
                dsp: {
                    ui8Code: Faust.str2ab(compiledStrCodes.dsp.strCode),
                    code: compiledStrCodes.dsp.code,
                    helpersCode: compiledStrCodes.dsp.helpersCode
                },
                effect: {
                    ui8Code: Faust.str2ab(compiledStrCodes.effect.strCode),
                    code: compiledStrCodes.effect.code,
                    helpersCode: compiledStrCodes.effect.helpersCode
                }
            } as TCompiledCodes;
            this.readDSPFactoryFromMachineAux(compiledCodes, shaKey, callback);
        }
    }
    readDSPFactoryFromMachineAux(codes: TCompiledCodes, shaKey: string, callback: (compiledDsp: TCompiledDsp) => any) {
        const time1 = performance.now();
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

        WebAssembly.compile(codes.dsp.ui8Code)
        .then((dspModule) => {
            const time2 = performance.now();
            this.log("WASM compilation duration : " + (time2 - time1));

            const compiledDsp = {
                shaKey,
                codes,
                dspModule,
                polyphony: [] as number[] // Default mode
            } as TCompiledDsp;

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
                callback(null);
                throw true;
            }

            this.factory_table[shaKey] = compiledDsp;

            // Possibly compile effect
            if (!codes.effectName) {
                WebAssembly.compile(codes.effect.ui8Code)
                .then((effectModule) => {

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
                        callback(null);
                        throw true;
                    }

                    callback(compiledDsp);
                }).catch((error) => {
                    this.error(error);
                    this.error("Faust DSP factory cannot be compiled");
                    callback(null);
                });
            } else {
                callback(compiledDsp);
            }
        }).catch((error) => {
            this.error(error);
            this.error("Faust DSP factory cannot be compiled");
            callback(null);
        });
    }
    deleteDSPFactory(compiledDsp: TCompiledDsp) {
        // The JS side is cleared
        delete this.factory_table[compiledDsp.shaKey];
        // The native C++ is cleared each time (freeWasmCModule has been already called in faust.compile)
        this.deleteAllWasmCDSPFactories();
    }
    log(...args: any[]) {
        if (this.debug) console.log(...args);
        this._log.push(JSON.stringify(args));
    }
    error(...args: any[]) {
        console.error(...args);
        this._log.push(JSON.stringify(args));
    }
}
LibFaustLoader.load("./libfaust-wasm.wasm").then(libFaust => window["faust"] = new Faust(libFaust));
window["LibFaustLoader"] = LibFaustLoader;
