import { TFaustUI, TFaustUIGroup, TFaustUIItem, TDspMeta } from "./types";
import { AudioWorkletProcessor, registerProcessor, AudioParamDescriptor, sampleRate } from "./AudioWorkletGlobalScope";
import { name, json, base64Code, meta } from "./FaustAudioWorkletGlobalScope";
import { FaustWebAssemblyExports } from "./FaustWebAssemblyExports";
class FaustConst {
    static atob(sBase64: string, nBlocksSize?: number) {
        // if (typeof atob === "function") return atob(sBase64); It does not return an ArrayBuffer
        const sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, "");
        const nInLen = sB64Enc.length;
        const nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2;
        const taBytes = new Uint8Array(nOutLen);
        for (let nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
            nMod4 = nInIdx & 3;
            nUint24 |= this.b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
            if (nMod4 === 3 || nInLen - nInIdx === 1) {
                for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
                    taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
                }
                nUint24 = 0;
            }
        }
        return taBytes.buffer;
    }
    static b64ToUint6(nChr: number) {
        return nChr > 64 && nChr < 91
            ? nChr - 65
            : nChr > 96 && nChr < 123
            ? nChr - 71
            : nChr > 47 && nChr < 58
            ? nChr + 4
            : nChr === 43
            ? 62
            : nChr === 47
            ? 63
            : 0;
    }
    static get importObject() {
        return {
            env: {
                memory: null as WebAssembly.Memory, memoryBase: 0, tableBase: 0,
                _abs: Math.abs,
                // Float version
                _acosf: Math.acos, _asinf: Math.asin, _atanf: Math.atan, _atan2f: Math.atan2,
                _ceilf: Math.ceil, _cosf: Math.cos, _expf: Math.exp, _floorf: Math.floor,
                _fmodf: (x: number, y: number) => x % y,
                _logf: Math.log, _log10f: Math.log10, _max_f: Math.max, _min_f: Math.min,
                _remainderf: (x: number, y: number) => x - Math.round(x / y) * y,
                _powf: Math.pow, _roundf: Math.fround, _sinf: Math.sin, _sqrtf: Math.sqrt, _tanf: Math.tan,
                // Double version
                _acos: Math.acos, _asin: Math.asin, _atan: Math.atan, _atan2: Math.atan2,
                _ceil: Math.ceil, _cos: Math.cos, _exp: Math.exp, _floor: Math.floor,
                _fmod: (x: number, y: number) => x % y,
                _log: Math.log, _log10: Math.log10, _max_: Math.max, _min_: Math.min,
                _remainder: (x: number, y: number) => x - Math.round(x / y) * y,
                _pow: Math.pow, _round: Math.fround, _sin: Math.sin, _sqrt: Math.sqrt, _tan: Math.tan,
                table: new WebAssembly.Table({ initial: 0, element: "anyfunc" })
            }
        };
    }
    static dspModule = new WebAssembly.Module(FaustConst.atob(base64Code));
    static dspInstance = new WebAssembly.Instance(FaustConst.dspModule, FaustConst.importObject);
}

class FaustAudioWorkletProcessor extends AudioWorkletProcessor {
    static bufferSize = 128;
    // JSON parsing functions
    static parseUI(ui: TFaustUI, obj: AudioParamDescriptor[] | FaustAudioWorkletProcessor, callback: (...args: any[]) => any) {
        for (let i = 0; i < ui.length; i++) {
            this.parseGroup(ui[i], obj, callback);
        }
    }
    static parseGroup(group: TFaustUIGroup, obj: AudioParamDescriptor[] | FaustAudioWorkletProcessor, callback: (...args: any[]) => any) {
        if (group.items) {
            this.parseItems(group.items, obj, callback);
        }
    }
    static parseItems(items: TFaustUIItem[], obj: AudioParamDescriptor[] | FaustAudioWorkletProcessor, callback: (...args: any[]) => any) {
        for (let i = 0; i < items.length; i++) {
            callback(items[i], obj, callback);
        }
    }
    static parseItem(item: TFaustUIItem, obj: AudioParamDescriptor[], callback: (...args: any[]) => any) {
        if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
            this.parseItems(item.items, obj, callback);
        } else if (item.type === "hbargraph" || item.type === "vbargraph") {
            // Nothing
        } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
            obj.push({ name: item.address, defaultValue: +item.init, minValue: +item.min, maxValue: +item.max });
        }
    }
    static parseItem2(item: TFaustUIItem, obj: FaustAudioWorkletProcessor, callback: (...args: any[]) => any) {
        if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
            this.parseItems(item.items, obj, callback);
        } else if (item.type === "hbargraph" || item.type === "vbargraph") {
            // Keep bargraph adresses
            obj.outputsItems.push(item.address);
            obj.pathTable$[item.address] = parseInt(item.index);
        } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
            // Keep inputs adresses
            obj.inputsItems.push(item.address);
            obj.pathTable$[item.address] = parseInt(item.index);
        }
    }
    static remap(v: number, mn0: number, mx0: number, mn1: number, mx1: number) {
        return (v - mn0) / (mx0 - mn0) * mx1 - mn1 + mn1;
    }
    static get parameterDescriptors() {
        // Analyse JSON to generate AudioParam parameters
        const params = [] as AudioParamDescriptor[];
        FaustAudioWorkletProcessor.parseUI(JSON.parse(json).ui, params, FaustAudioWorkletProcessor.parseItem);
        return params;
    }
    dspMeta: TDspMeta;
    $ins: number;
    $outs: number;
    dspInChannnels: Float32Array[];
    dspOutChannnels: Float32Array[];
    numIn: number;
    numOut: number;
    ptrSize: number;
    sampleSize: number;
    outputsTimer: number;
    inputsItems: string[];
    outputsItems: string[];
    pathTable$: { [address: string]: number };
    $audioHeap: number;
    $$audioHeapInputs: number;
    $$audioHeapOutputs: number;
    $audioHeapInputs: number;
    $audioHeapOutputs: number;
    $dsp: number;
    factory: FaustWebAssemblyExports;
    HEAP: ArrayBuffer;
    HEAP32: Int32Array;
    HEAPF32: Float32Array;
    outputHandler: (address: string, value: number) => any;
    updateOutputs: () => void;
    /**
     * Setup WebAudio WorkletProcessor callbacks
     *
     * @memberof FaustAudioWorkletProcessor
     */
    setup: () => void;
    /**
     * Set control value.
     *
     * @param {string} path - the path to the wanted control (retrieved using 'getParams' method)
     * @param {number} val - the float value for the wanted parameter
     * @memberof FaustAudioWorkletProcessor
     */
    setParamValue: (path: string, val: number) => void;
    /**
     * Get control value.
     *
     * @param {string} path - the path to the wanted control (retrieved using 'controls' method)
     *
     * @returns {number} the float value
     * @memberof FaustAudioWorkletProcessor
     */
    getParamValue: (path: string) => number;
    constructor(options: AudioWorkletNodeOptions) {
        super(options);
        this.dspMeta = meta;

        this.outputHandler = (path, value) => this.port.postMessage({ path, value });

        this.$ins = null;
        this.$outs = null;

        this.dspInChannnels = [];
        this.dspOutChannnels = [];

        this.numIn = parseInt(this.dspMeta.inputs);
        this.numOut = parseInt(this.dspMeta.outputs);

        // Memory allocator
        this.ptrSize = 4;
        this.sampleSize = 4;

        // Create the WASM instance
        this.factory = FaustConst.dspInstance.exports;
        this.HEAP = FaustConst.dspInstance.exports.memory.buffer;
        this.HEAP32 = new Int32Array(this.HEAP);
        this.HEAPF32 = new Float32Array(this.HEAP);

        // console.log(this.HEAP);
        // console.log(this.HEAP32);
        // console.log(this.HEAPF32);

        // bargraph
        this.outputsTimer = 5;
        this.outputsItems = [];

        // input items
        this.inputsItems = [];

        // Start of HEAP index

        // DSP is placed first with index 0. Audio buffer start at the end of DSP.
        this.$audioHeap = parseInt(this.dspMeta.size);

        // Setup pointers offset
        this.$$audioHeapInputs = this.$audioHeap;
        this.$$audioHeapOutputs = this.$$audioHeapInputs + this.numIn * this.ptrSize;

        // Setup buffer offset
        this.$audioHeapInputs = this.$$audioHeapOutputs + (this.numOut * this.ptrSize);
        this.$audioHeapOutputs = this.$audioHeapInputs + (this.numIn * FaustAudioWorkletProcessor.bufferSize * this.sampleSize);

        // Start of DSP memory : DSP is placed first with index 0
        this.$dsp = 0;

        this.pathTable$ = {};

        // Send output values to the AudioNode
        this.updateOutputs = () => {
            if (this.outputsItems.length > 0 && this.outputHandler && this.outputsTimer-- === 0) {
                this.outputsTimer = 5;
                for (let i = 0; i < this.outputsItems.length; i++) {
                    this.outputHandler(this.outputsItems[i], this.HEAPF32[this.pathTable$[this.outputsItems[i]] >> 2]);
                }
            }
        };
        this.setup = () => {
            const bufferSize = FaustAudioWorkletProcessor.bufferSize;
            if (this.numIn > 0) {
                this.$ins = this.$$audioHeapInputs;
                for (let i = 0; i < this.numIn; i++) {
                    this.HEAP32[(this.$ins >> 2) + i] = this.$audioHeapInputs + bufferSize * this.sampleSize * i;
                }
                // Prepare Ins buffer tables
                const dspInChans = this.HEAP32.subarray(this.$ins >> 2, (this.$ins + this.numIn * this.ptrSize) >> 2);
                for (let i = 0; i < this.numIn; i++) {
                    this.dspInChannnels[i] = this.HEAPF32.subarray(dspInChans[i] >> 2, (dspInChans[i] + bufferSize * this.sampleSize) >> 2);
                }
            }
            if (this.numOut > 0) {
                this.$outs = this.$$audioHeapOutputs;
                for (let i = 0; i < this.numOut; i++) {
                    this.HEAP32[(this.$outs >> 2) + i] = this.$audioHeapOutputs + bufferSize * this.sampleSize * i;
                }
                // Prepare Out buffer tables
                const dspOutChans = this.HEAP32.subarray(this.$outs >> 2, (this.$outs + this.numOut * this.ptrSize) >> 2);
                for (let i = 0; i < this.numOut; i++) {
                    this.dspOutChannnels[i] = this.HEAPF32.subarray(dspOutChans[i] >> 2, (dspOutChans[i] + FaustAudioWorkletProcessor.bufferSize * this.sampleSize) >> 2);
                }
            }
            // Parse UI
            FaustAudioWorkletProcessor.parseUI(this.dspMeta.ui, this, FaustAudioWorkletProcessor.parseItem2);

            // Init DSP
            this.factory.init(this.$dsp, sampleRate); // 'sampleRate' is defined in AudioWorkletGlobalScope
        };
        this.setParamValue = (path, val) => this.HEAPF32[this.pathTable$[path]] = val;
        this.getParamValue = path => this.HEAPF32[this.pathTable$[path]];

        // Init resulting DSP
        this.setup();
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any) {
        const input = inputs[0];
        const output = outputs[0];
        // Check inputs
        if (this.numIn > 0 && (input === undefined || input[0].length === 0)) {
            // console.log("Process input error");
            return true;
        }
        // Check outputs
        if (this.numOut > 0 && (output === undefined || output[0].length === 0)) {
            // console.log("Process output error");
            return true;
        }
        // Copy inputs
        if (input !== undefined) {
            for (let chan = 0; chan < Math.min(this.numIn, input.length) ; ++chan) {
                const dspInput = this.dspInChannnels[chan];
                dspInput.set(input[chan]);
            }
        }
        // Update controls (possibly needed for sample accurate control)
        for (const key in parameters) {
            const value = parameters[key];
            this.HEAPF32[this.pathTable$[key] >> 2] = value[0];
        }
        // Compute
        this.factory.compute(this.$dsp, FaustAudioWorkletProcessor.bufferSize, this.$ins, this.$outs);
        // Update bargraph
        this.updateOutputs();
        // Copy outputs
        if (output !== undefined) {
            for (let chan = 0; chan < Math.min(this.numOut, output.length); ++chan) {
                const dspOutput = this.dspOutChannnels[chan];
                output[chan].set(dspOutput);
            }
        }
        return true;
    }
}

// Globals
// Synchronously compile and instantiate the WASM module
try {
    registerProcessor(name || "mydsp", FaustAudioWorkletProcessor);
} catch (e) {
    console.log(e); console.log("Faust " + (name || "mydsp") + " cannot be loaded or compiled");
}
