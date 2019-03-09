"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
};
Object.defineProperty(exports, "__esModule", { value: true });
var libfaust_wasm_1 = require("libfaust-wasm");
var sha1_js_1 = require("crypto-libraries/sha1.js");
var Binaryen = require("binaryen");
var faustModule = new libfaust_wasm_1.FaustModule();
faustModule.lengthBytesUTF8 = function (str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
            u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127)
            ++len;
        else if (u <= 2047)
            len += 2;
        else if (u <= 65535)
            len += 3;
        else if (u <= 2097151)
            len += 4;
        else if (u <= 67108863)
            len += 5;
        else
            len += 6;
    }
    return len;
};
var Faust = (function () {
    function Faust(options) {
        this.debug = false;
        this.factory_number = 0;
        this.factory_table = {};
        this._log = [];
        this.debug = options && options.debug ? true : false;
    }
    Faust.getLibFaustVersion = function () {
        return faustModule.UTF8ToString(this.getCLibFaustVersion());
    };
    Faust.ab2str = function (buf) {
        return buf ? String.fromCharCode.apply(null, new Uint8Array(buf)) : null;
    };
    Faust.str2ab = function (str) {
        if (!str)
            return null;
        var buf = new ArrayBuffer(str.length);
        var bufView = new Uint8Array(buf);
        for (var i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    };
    Faust.prototype.compileCode = function (factoryName, code, argv, internalMemory) {
        var codeSize = faustModule.lengthBytesUTF8(code) + 1;
        var $code = faustModule._malloc(codeSize);
        var name = "FaustDSP";
        var nameSize = faustModule.lengthBytesUTF8(name) + 1;
        var $name = faustModule._malloc(nameSize);
        var $errorMsg = faustModule._malloc(4096);
        faustModule.stringToUTF8(name, $name, nameSize);
        faustModule.stringToUTF8(code, $code, codeSize);
        var argvAux = argv || [];
        argvAux.push("-cn", factoryName);
        var ptrSize = 4;
        var $argv = faustModule._malloc(argvAux.length * ptrSize);
        var $argv_buffer = new Int32Array(faustModule.HEAP32.buffer, $argv, argvAux.length);
        for (var i = 0; i < argvAux.length; i++) {
            var $arg_size = faustModule.lengthBytesUTF8(argvAux[i]) + 1;
            var $arg = faustModule._malloc($arg_size);
            faustModule.stringToUTF8(argvAux[i], $arg, $arg_size);
            $argv_buffer[i] = $arg;
        }
        try {
            var time1 = performance.now();
            var $moduleCode = Faust.createWasmCDSPFactoryFromString($name, $code, argvAux.length, $argv, $errorMsg, internalMemory);
            var time2 = performance.now();
            this.log("Faust compilation duration : " + (time2 - time1));
            var errorMsg = faustModule.UTF8ToString($errorMsg);
            if (errorMsg)
                this.error(errorMsg);
            if ($moduleCode === 0)
                return null;
            var $compiledCode = Faust.getWasmCModule($moduleCode);
            var compiledCodeSize = Faust.getWasmCModuleSize($moduleCode);
            var ui8Code = new Uint8Array(compiledCodeSize);
            for (var i = 0; i < compiledCodeSize; i++) {
                ui8Code[i] = faustModule.HEAP8[$compiledCode + i];
            }
            var $helpersCode = Faust.getWasmCHelpers($moduleCode);
            var helpersCode = faustModule.UTF8ToString($helpersCode);
            faustModule._free($code);
            faustModule._free($name);
            faustModule._free($errorMsg);
            Faust.freeWasmCModule($moduleCode);
            $argv_buffer = new Int32Array(faustModule.HEAP32.buffer, $argv, argvAux.length);
            for (var i = 0; i < argvAux.length; i++) {
                faustModule._free($argv_buffer[i]);
            }
            faustModule._free($argv);
            return { ui8Code: ui8Code, code: code, helpersCode: helpersCode };
        }
        catch (e) {
            var errorMsg = faustModule.UTF8ToString(Faust.getErrorAfterException());
            if (errorMsg)
                errorMsg = e;
            this.error(errorMsg);
            Faust.cleanupAfterException();
            return null;
        }
    };
    Faust.prototype.createDSPFactoryAux = function (code, argv, internalMemory, callback) {
        var strArgv = argv.join("");
        var shaKey = sha1_js_1.default.hash(code + (internalMemory ? "internal_memory" : "external_memory") + strArgv, { msgFormat: "string" });
        var compiledDsp = this.factory_table[shaKey];
        if (compiledDsp) {
            this.log("Existing library : " + compiledDsp.codes.dspName);
            return callback(compiledDsp);
        }
        this.log("libfaust.js version : " + Faust.getLibFaustVersion());
        var dspName = "mydsp" + this.factory_number;
        var effectName = "effect" + this.factory_number++;
        var effectCode = "adapt(1,1) = _; adapt(2,2) = _,_; adapt(1,2) = _ <: _,_; adapt(2,1) = _,_ :> _;\n            adaptor(F,G) = adapt(outputs(F),inputs(G));\n            dsp_code = environment{" + code + "};\n            process = adaptor(dsp_code.process, dsp_code.effect) : dsp_code.effect;";
        var dspCompiledCode = this.compileCode(dspName, code, argv, internalMemory);
        if (!dspCompiledCode)
            return callback(null);
        var effectCompiledCode = this.compileCode(effectName, effectCode, argv, internalMemory);
        var compiledCodes = { dspName: dspName, effectName: effectName, dsp: dspCompiledCode, effect: effectCompiledCode };
        return this.readDSPFactoryFromMachineAux(compiledCodes, shaKey, callback);
    };
    Faust.prototype.createDSPFactory = function (code, argv, callback) {
        return this.createDSPFactoryAux(code, argv, true, callback);
    };
    Faust.prototype.createPolyDSPFactory = function (code, argv, callback) {
        return this.createDSPFactoryAux(code, argv, false, callback);
    };
    Faust.prototype.expandDSP = function (code, argvIn) {
        this.log("libfaust.js version : " + Faust.getLibFaustVersion());
        var codeSize = faustModule.lengthBytesUTF8(code) + 1;
        var $code = faustModule._malloc(codeSize);
        var name = "FaustDSP";
        var nameSize = faustModule.lengthBytesUTF8(name) + 1;
        var $name = faustModule._malloc(nameSize);
        var $shaKey = faustModule._malloc(64);
        var $errorMsg = faustModule._malloc(4096);
        faustModule.stringToUTF8(name, $name, nameSize);
        faustModule.stringToUTF8(code, $code, codeSize);
        var argv = argvIn || [];
        argv.push("-lang");
        argv.push("wasm");
        var ptrSize = 4;
        var $argv = faustModule._malloc(argv.length * ptrSize);
        var $argv_buffer = new Int32Array(faustModule.HEAP32.buffer, $argv, argv.length);
        for (var i = 0; i < argv.length; i++) {
            var $arg_size = faustModule.lengthBytesUTF8(argv[i]) + 1;
            var $arg = faustModule._malloc($arg_size);
            faustModule.stringToUTF8(argv[i], $arg, $arg_size);
            $argv_buffer[i] = $arg;
        }
        try {
            var $expandDsp = Faust.expandCDSPFromString($name, $code, argv.length, $argv, $shaKey, $errorMsg);
            var expandDsp = faustModule.UTF8ToString($expandDsp);
            var shaKey = faustModule.UTF8ToString($shaKey);
            var errorMsg = faustModule.UTF8ToString($errorMsg);
            if (errorMsg)
                this.error(errorMsg);
            faustModule._free($code);
            faustModule._free($name);
            faustModule._free($shaKey);
            faustModule._free($errorMsg);
            Faust.freeCMemory($expandDsp);
            $argv_buffer = new Int32Array(faustModule.HEAP32.buffer, $argv, argv.length);
            for (var i = 0; i < argv.length; i++) {
                faustModule._free($argv_buffer[i]);
            }
            faustModule._free($argv);
            return expandDsp;
        }
        catch (e) {
            var errorMsg = faustModule.UTF8ToString(Faust.getErrorAfterException());
            if (errorMsg)
                errorMsg = e;
            this.error(errorMsg);
            Faust.cleanupAfterException();
            return null;
        }
    };
    Faust.prototype.writeDSPFactoryToMachine = function (compiledCodes) {
        return {
            dspName: compiledCodes.dspName,
            dsp: {
                strCode: Faust.ab2str(compiledCodes.dsp.ui8Code),
                code: compiledCodes.dsp.code,
                helpersCode: compiledCodes.dsp.helpersCode
            },
            effectName: compiledCodes.effectName,
            effect: {
                strCode: Faust.ab2str(compiledCodes.effect.ui8Code),
                code: compiledCodes.effect.code,
                helpersCode: compiledCodes.effect.helpersCode
            }
        };
    };
    Faust.prototype.readDSPFactoryFromMachine = function (compiledStrCodes, callback) {
        var shaKey = sha1_js_1.default.hash(compiledStrCodes.dsp.code, { msgFormat: "string" });
        var compiledDsp = this.factory_table[shaKey];
        if (compiledDsp) {
            this.log("Existing library : " + compiledDsp.codes.dspName);
            callback(compiledDsp);
        }
        else {
            var compiledCodes = {
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
            };
            this.readDSPFactoryFromMachineAux(compiledCodes, shaKey, callback);
        }
    };
    Faust.prototype.readDSPFactoryFromMachineAux = function (codes, shaKey, callback) {
        var _this = this;
        var time1 = performance.now();
        if (typeof Binaryen !== "undefined") {
            try {
                var binaryenModule = Binaryen.readBinary(codes.dsp.ui8Code);
                this.log("Binaryen based optimisation");
                binaryenModule.optimize();
                codes.dsp.ui8Code = binaryenModule.emitBinary();
                binaryenModule.dispose();
            }
            catch (e) {
                this.log("Binaryen not available, no optimisation...");
            }
        }
        WebAssembly.compile(codes.dsp.ui8Code)
            .then(function (dspModule) {
            var time2 = performance.now();
            _this.log("WASM compilation duration : " + (time2 - time1));
            var compiledDsp = {
                shaKey: shaKey,
                codes: codes,
                dspModule: dspModule,
                polyphony: []
            };
            try {
                var json = codes.dsp.helpersCode.match(/getJSON\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*'(\{.+?)';[\s\n]+}/)[1];
                var base64Code = codes.dsp.helpersCode.match(/getBase64Code\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*"([A-Za-z0-9+/=]+?)";[\s\n]+}/)[1];
                var meta = JSON.parse(json);
                compiledDsp.dspHelpers = { json: json, base64Code: base64Code, meta: meta };
            }
            catch (e) {
                _this.error("Error in JSON.parse: " + e);
                callback(null);
                throw true;
            }
            _this.factory_table[shaKey] = compiledDsp;
            if (!codes.effectName) {
                WebAssembly.compile(codes.effect.ui8Code)
                    .then(function (effectModule) {
                    compiledDsp.effectModule = effectModule;
                    try {
                        var json = codes.effect.helpersCode.match(/getJSON\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*'(\{.+?)';[\s\n]+}/)[1];
                        var base64Code = codes.effect.helpersCode.match(/getBase64Code\w+?\(\)[\s\n]*{[\s\n]*return[\s\n]*"([A-Za-z0-9+/=]+?)";[\s\n]+}/)[1];
                        var meta = JSON.parse(json);
                        compiledDsp.effectHelpers = { json: json, base64Code: base64Code, meta: meta };
                    }
                    catch (e) {
                        _this.error("Error in JSON.parse: " + e);
                        callback(null);
                        throw true;
                    }
                    callback(compiledDsp);
                }).catch(function (error) {
                    _this.error(error);
                    _this.error("Faust DSP factory cannot be compiled");
                    callback(null);
                });
            }
            else {
                callback(compiledDsp);
            }
        }).catch(function (error) {
            _this.error(error);
            _this.error("Faust DSP factory cannot be compiled");
            callback(null);
        });
    };
    Faust.prototype.deleteDSPFactory = function (compiledDsp) {
        delete this.factory_table[compiledDsp.shaKey];
        Faust.deleteAllWasmCDSPFactories();
    };
    Faust.prototype.log = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.debug)
            console.log.apply(console, __spread(args));
        this._log.push(JSON.stringify(args));
    };
    Faust.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        console.error.apply(console, __spread(args));
        this._log.push(JSON.stringify(args));
    };
    Faust.createWasmCDSPFactoryFromString = faustModule.cwrap("createWasmCDSPFactoryFromString", "number", ["number", "number", "number", "number", "number", "number"]);
    Faust.deleteAllWasmCDSPFactories = faustModule.cwrap("deleteAllWasmCDSPFactories", null, []);
    Faust.expandCDSPFromString = faustModule.cwrap("expandCDSPFromString", "number", ["number", "number", "number", "number", "number", "number"]);
    Faust.getCLibFaustVersion = faustModule.cwrap("getCLibFaustVersion", "number", []);
    Faust.getWasmCModule = faustModule.cwrap("getWasmCModule", "number", ["number"]);
    Faust.getWasmCModuleSize = faustModule.cwrap("getWasmCModuleSize", "number", ["number"]);
    Faust.getWasmCHelpers = faustModule.cwrap("getWasmCHelpers", "number", ["number"]);
    Faust.freeWasmCModule = faustModule.cwrap("freeWasmCModule", null, ["number"]);
    Faust.freeCMemory = faustModule.cwrap("freeCMemory", null, ["number"]);
    Faust.cleanupAfterException = faustModule.cwrap("cleanupAfterException", null, []);
    Faust.getErrorAfterException = faustModule.cwrap("getErrorAfterException", "number", []);
    return Faust;
}());
//# sourceMappingURL=index.js.map