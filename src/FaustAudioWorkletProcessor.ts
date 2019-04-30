/* eslint-disable no-console */
/* eslint-disable no-restricted-properties */
/* eslint-disable @typescript-eslint/camelcase */
/* eslint-disable object-property-newline */
/* eslint-env worker */
import { TDspMeta, FaustDspNode, TFaustUI, TFaustUIGroup, TFaustUIItem, FaustWebAssemblyExports, FaustWebAssemblyMixerExports } from "./types";

// AudioWorklet Globals
declare class AudioWorkletProcessor {
    public port: MessagePort;
    public process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any): boolean;
    constructor(options: AudioWorkletNodeOptions);
}
type AudioWorkletProcessorConstructor<T extends AudioWorkletProcessor> = {
    new (options: AudioWorkletNodeOptions): T;
};
declare function registerProcessor<T extends AudioWorkletProcessor>(name: string, constructor: AudioWorkletProcessorConstructor<T>): void;
declare const currentFrame: number;
declare const currentTime: number;
declare const sampleRate: number;
interface AudioParamDescriptor {
    automationRate?: AutomationRate;
    defaultValue?: number;
    maxValue?: number;
    minValue?: number;
    name: string;
}

// Injected by Faust
type FaustData = {
    id: string;
    dspMeta: TDspMeta;
    dspBase64Code: string;
    effectMeta?: TDspMeta;
    effectBase64Code?: string;
    mixerBase64Code?: string;
    bufferSize?: number;
    voices?: number;
    plot?: number;
};
declare const faustData: FaustData;

export const FaustAudioWorkletProcessorWrapper = () => {
    class FaustConst {
        static atoab(sBase64: string, nBlocksSize?: number) {
            const sB64Enc = sBase64.replace(/[^A-Za-z0-9+/]/g, "");
            const nInLen = sB64Enc.length;
            const nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2;
            const taBytes = new Uint8Array(nOutLen);
            for (let nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
                nMod4 = nInIdx & 3;
                nUint24 |= this.atoUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
                if (nMod4 === 3 || nInLen - nInIdx === 1) {
                    for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
                        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
                    }
                    nUint24 = 0;
                }
            }
            return taBytes.buffer;
        }
        static atoUint6(nChr: number) {
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
        static midiToFreq(note: number) {
            return 440.0 * 2 ** ((note - 69) / 12);
        }
        static remap(v: number, mn0: number, mx0: number, mn1: number, mx1: number) {
            return (v - mn0) / (mx0 - mn0) * (mx1 - mn1) + mn1;
        }
        static findPath(o: any, p: string) {
            if (typeof o !== "object") return false;
            if (o.address) {
                if (o.address === p) return true;
                return false;
            }
            for (const k in o) {
                if (this.findPath(o[k], p)) return true;
            }
            return false;
        }
        static get importObject() {
            return {
                env: {
                    memory: this.voices ? this.memory : undefined, memoryBase: 0, tableBase: 0,
                    _abs: Math.abs,
                    // Float version
                    _acosf: Math.acos, _asinf: Math.asin, _atanf: Math.atan, _atan2f: Math.atan2,
                    _ceilf: Math.ceil, _cosf: Math.cos, _expf: Math.exp, _floorf: Math.floor,
                    _fmodf: (x: number, y: number) => x % y,
                    _logf: Math.log, _log10f: Math.log10, _max_f: Math.max, _min_f: Math.min,
                    _remainderf: (x: number, y: number) => x - Math.round(x / y) * y,
                    _powf: Math.pow, _roundf: Math.fround, _sinf: Math.sin, _sqrtf: Math.sqrt, _tanf: Math.tan,
                    _acosfh: Math.acosh, _asinfh: Math.asinh, _atanfh: Math.atanh,
                    _cosfh: Math.cosh, _sinfh: Math.sinh, _tanfh: Math.tanh,
                    // Double version
                    _acos: Math.acos, _asin: Math.asin, _atan: Math.atan, _atan2: Math.atan2,
                    _ceil: Math.ceil, _cos: Math.cos, _exp: Math.exp, _floor: Math.floor,
                    _fmod: (x: number, y: number) => x % y,
                    _log: Math.log, _log10: Math.log10, _max_: Math.max, _min_: Math.min,
                    _remainder: (x: number, y: number) => x - Math.round(x / y) * y,
                    _pow: Math.pow, _round: Math.fround, _sin: Math.sin, _sqrt: Math.sqrt, _tan: Math.tan,
                    _acosh: Math.acosh, _asinh: Math.asinh, _atanh: Math.atanh,
                    _cosh: Math.cosh, _sinh: Math.sinh, _tanh: Math.tanh,
                    table: new WebAssembly.Table({ initial: 0, element: "anyfunc" })
                }
            };
        }
        static createMemory() {
            // Hack : at least 4 voices (to avoid weird wasm memory bug?)
            const voices = Math.max(4, this.voices);
            // Memory allocator
            const ptrSize = 4;
            const sampleSize = 4;
            const pow2limit = (x: number) => {
                let n = 65536; // Minimum = 64 kB
                while (n < x) { n *= 2; }
                return n;
            };
            const { dspMeta, effectMeta } = this;
            const effectSize = effectMeta ? parseInt(effectMeta.size) : 0;
            let memorySize = pow2limit(
                effectSize
                + parseInt(dspMeta.size) * voices
                + (parseInt(dspMeta.inputs) + parseInt(dspMeta.outputs) * 2)
                * (ptrSize + this.bufferSize * sampleSize)
            ) / 65536;
            memorySize = Math.max(2, memorySize); // As least 2
            return new WebAssembly.Memory({ initial: memorySize, maximum: memorySize });
        }
        static id = faustData.id;
        static dspMeta = faustData.dspMeta;
        static effectMeta = faustData.effectMeta;
        static bufferSize = faustData.bufferSize || 128;
        static voices = faustData.voices;
        static memory = FaustConst.voices ? FaustConst.createMemory() : undefined;
        static plot = faustData.plot;
        private static dspBase64Code = faustData.dspBase64Code;
        private static dspModule = new WebAssembly.Module(FaustConst.atoab(FaustConst.dspBase64Code));
        static dspInstance = new WebAssembly.Instance(FaustConst.dspModule, FaustConst.importObject);
        private static effectBase64Code = faustData.effectBase64Code;
        private static effectModule = FaustConst.effectBase64Code ? new WebAssembly.Module(FaustConst.atoab(FaustConst.effectBase64Code)) : undefined;
        static effectInstance = FaustConst.effectModule ? new WebAssembly.Instance(FaustConst.effectModule, FaustConst.importObject) : undefined;
        private static mixerBase64Code = faustData.mixerBase64Code;
        private static mixerModule = FaustConst.voices ? new WebAssembly.Module(FaustConst.atoab(FaustConst.mixerBase64Code)) : undefined;
        private static mixerObject = FaustConst.voices ? { imports: { print: console.log }, memory: { memory: FaustConst.memory } } : undefined;
        static mixerInstance = FaustConst.voices ? new WebAssembly.Instance(FaustConst.mixerModule, FaustConst.mixerObject) : undefined;
    }
    class FaustAudioWorkletProcessor extends AudioWorkletProcessor implements FaustDspNode {
        static bufferSize = FaustConst.bufferSize;
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
                FaustAudioWorkletProcessor.parseItems(item.items, obj, callback); // callback may not binded to this
            } else if (item.type === "hbargraph" || item.type === "vbargraph") {
                // Nothing
            } else if (item.type === "vslider" || item.type === "hslider" || item.type === "nentry") {
                obj.push({ name: item.address, defaultValue: +item.init || 0, minValue: isFinite(+item.min) ? +item.min : Number.MIN_VALUE, maxValue: isFinite(+item.max) ? +item.max : Number.MAX_VALUE });
            } else if (item.type === "button" || item.type === "checkbox") {
                obj.push({ name: item.address, defaultValue: +item.init || 0, minValue: 0, maxValue: 1 });
            }
        }
        static parseItem2(item: TFaustUIItem, obj: FaustAudioWorkletProcessor, callback: (...args: any[]) => any) {
            if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
                FaustAudioWorkletProcessor.parseItems(item.items, obj, callback); // callback may not binded to this
            } else if (item.type === "hbargraph" || item.type === "vbargraph") {
                // Keep bargraph adresses
                obj.outputsItems.push(item.address);
                obj.pathTable$[item.address] = parseInt(item.index); // eslint-disable-line no-param-reassign
            } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
                // Keep inputs adresses
                obj.inputsItems.push(item.address);
                obj.pathTable$[item.address] = parseInt(item.index); // eslint-disable-line no-param-reassign
                if (!item.meta) return;
                item.meta.forEach((meta) => {
                    const { midi } = meta;
                    if (!midi) return;
                    const strMidi = midi.trim();
                    if (strMidi === "pitchwheel") {
                        obj.fPitchwheelLabel.push(item.address);
                    } else {
                        const matched = strMidi.match(/^ctrl\s(\d+)/);
                        if (!matched) return;
                        obj.fCtrlLabel[parseInt(matched[1])].push({ path: item.address, min: parseFloat(item.min), max: parseFloat(item.max) });
                    }
                });
            }
        }
        static get parameterDescriptors() {
            // Analyse JSON to generate AudioParam parameters
            const params = [] as AudioParamDescriptor[];
            this.parseUI(FaustConst.dspMeta.ui, params, this.parseItem);
            if (FaustConst.effectMeta) this.parseUI(FaustConst.effectMeta.ui, params, this.parseItem);
            return params;
        }
        bufferSize: number;
        voices: number;
        dspMeta: TDspMeta;
        $ins: number;
        $outs: number;
        dspInChannnels: Float32Array[];
        dspOutChannnels: Float32Array[];
        fPitchwheelLabel: string[];
        fCtrlLabel: { path: string; min: number; max: number }[][];
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

        effectMeta?: TDspMeta;
        $effect?: number;
        $mixing?: number;
        fFreqLabel$?: number[];
        fGateLabel$?: number[];
        fGainLabel$?: number[];
        fDate?: number;
        $$audioHeapMixing?: number;
        $audioHeapMixing?: number;
        mixer?: FaustWebAssemblyMixerExports;
        effect?: FaustWebAssemblyExports;
        dspVoices$?: number[];
        dspVoicesState?: number[];
        dspVoicesLevel?: number[];
        dspVoicesDate?: number[];
        kActiveVoice?: number;
        kFreeVoice?: number;
        kReleaseVoice?: number;
        kNoVoice?: number;

        plot: number;
        $plot: number;
        plotted: Float32Array[];

        outputHandler: (address: string, value: number) => any;
        computeHandler: (bufferSize: number) => any;

        handleMessage = (event: MessageEvent) => { // use arrow function for binding
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
                case "replot":
                    this.plot = msg.count;
                    this.$plot = 0;
                    this.plotted = new Array(this.numOut).fill(null).map(() => new Float32Array(this.plot));
                    break;
                default:
            }
        }
        constructor(options: AudioWorkletNodeOptions) {
            super(options);
            this.port.onmessage = this.handleMessage; // Naturally binded with arrow function property

            this.bufferSize = FaustConst.bufferSize;
            this.voices = FaustConst.voices;
            this.dspMeta = FaustConst.dspMeta;

            this.outputHandler = (path, value) => this.port.postMessage({ path, value, type: "param" });
            this.computeHandler = null;

            this.$ins = null;
            this.$outs = null;

            this.dspInChannnels = [];
            this.dspOutChannnels = [];

            this.fPitchwheelLabel = [];
            this.fCtrlLabel = new Array(128).fill(null).map(() => []);

            this.numIn = parseInt(this.dspMeta.inputs);
            this.numOut = parseInt(this.dspMeta.outputs);

            // Memory allocator
            this.ptrSize = 4;
            this.sampleSize = 4;

            // Create the WASM instance
            this.factory = FaustConst.dspInstance.exports;
            this.HEAP = this.voices ? FaustConst.memory.buffer : this.factory.memory.buffer;
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
            this.$audioHeap = this.voices ? 0 : parseInt(this.dspMeta.size);

            // Setup pointers offset
            this.$$audioHeapInputs = this.$audioHeap;
            this.$$audioHeapOutputs = this.$$audioHeapInputs + this.numIn * this.ptrSize;

            // Setup buffer offset
            this.$audioHeapInputs = this.$$audioHeapOutputs + (this.numOut * this.ptrSize);
            this.$audioHeapOutputs = this.$audioHeapInputs + (this.numIn * this.bufferSize * this.sampleSize);
            if (this.voices) {
                this.$$audioHeapMixing = this.$$audioHeapOutputs + this.numOut * this.ptrSize;
                // Setup buffer offset
                this.$audioHeapInputs = this.$$audioHeapMixing + this.numOut * this.ptrSize;
                this.$audioHeapOutputs = this.$audioHeapInputs + this.numIn * this.bufferSize * this.sampleSize;
                this.$audioHeapMixing = this.$audioHeapOutputs + this.numOut * this.bufferSize * this.sampleSize;
                this.$dsp = this.$audioHeapMixing + this.numOut * this.bufferSize * this.sampleSize;
            } else {
                this.$audioHeapInputs = this.$$audioHeapOutputs + this.numOut * this.ptrSize;
                this.$audioHeapOutputs = this.$audioHeapInputs + this.numIn * this.bufferSize * this.sampleSize;
                // Start of DSP memory : Mono DSP is placed first with index 0
                this.$dsp = 0;
            }

            if (this.voices) {
                this.effectMeta = FaustConst.effectMeta;
                this.$mixing = null;
                this.fFreqLabel$ = [];
                this.fGateLabel$ = [];
                this.fGainLabel$ = [];
                this.fDate = 0;

                this.mixer = FaustConst.mixerInstance.exports;
                this.effect = FaustConst.effectInstance ? FaustConst.effectInstance.exports : null;

                // Start of DSP memory ('polyphony' DSP voices)
                this.dspVoices$ = [];
                this.dspVoicesState = [];
                this.dspVoicesLevel = [];
                this.dspVoicesDate = [];

                this.kActiveVoice = 0;
                this.kFreeVoice = -1;
                this.kReleaseVoice = -2;
                this.kNoVoice = -3;

                for (let i = 0; i < this.voices; i++) {
                    this.dspVoices$[i] = this.$dsp + i * parseInt(this.dspMeta.size);
                    this.dspVoicesState[i] = this.kFreeVoice;
                    this.dspVoicesLevel[i] = 0;
                    this.dspVoicesDate[i] = 0;
                }
                // Effect memory starts after last voice
                this.$effect = this.dspVoices$[this.voices - 1] + parseInt(this.dspMeta.size);
            }

            this.pathTable$ = {};

            this.plot = FaustConst.plot;
            this.$plot = 0;
            this.plotted = new Array(this.numOut).fill(null).map(() => new Float32Array(this.plot));

            // Init resulting DSP
            this.setup();
        }
        updateOutputs() {
            if (this.outputsItems.length > 0 && this.outputHandler && this.outputsTimer-- === 0) {
                this.outputsTimer = 5;
                this.outputsItems.forEach(item => this.outputHandler(item, this.factory.getParamValue(this.$dsp, this.pathTable$[item])));
            }
        }

        parseUI(ui: TFaustUI) {
            return FaustAudioWorkletProcessor.parseUI(ui, this, FaustAudioWorkletProcessor.parseItem2);
        }
        parseGroup(group: TFaustUIGroup) {
            return FaustAudioWorkletProcessor.parseGroup(group, this, FaustAudioWorkletProcessor.parseItem2);
        }
        parseItems(items: TFaustUIItem[]) {
            return FaustAudioWorkletProcessor.parseItems(items, this, FaustAudioWorkletProcessor.parseItem2);
        }
        parseItem(item: TFaustUIItem) {
            return FaustAudioWorkletProcessor.parseItem2(item, this, FaustAudioWorkletProcessor.parseItem2);
        }

        setParamValue(path: string, val: number) {
            if (this.voices) {
                if (this.effect && FaustConst.findPath(this.effectMeta.ui, path)) this.effect.setParamValue(this.$effect, this.pathTable$[path], val);
                else this.dspVoices$.forEach($voice => this.factory.setParamValue($voice, this.pathTable$[path], val));
            } else {
                this.factory.setParamValue(this.$dsp, this.pathTable$[path], val);
            }
        }
        getParamValue(path: string) {
            if (this.voices) {
                if (this.effect && FaustConst.findPath(this.effectMeta.ui, path)) return this.effect.getParamValue(this.$effect, this.pathTable$[path]);
                return this.factory.getParamValue(this.dspVoices$[0], this.pathTable$[path]);
            }
            return this.factory.getParamValue(this.$dsp, this.pathTable$[path]);
        }
        setup() {
            if (this.numIn > 0) {
                this.$ins = this.$$audioHeapInputs;
                for (let i = 0; i < this.numIn; i++) {
                    this.HEAP32[(this.$ins >> 2) + i] = this.$audioHeapInputs + this.bufferSize * this.sampleSize * i;
                }
                // Prepare Ins buffer tables
                const dspInChans = this.HEAP32.subarray(this.$ins >> 2, (this.$ins + this.numIn * this.ptrSize) >> 2);
                for (let i = 0; i < this.numIn; i++) {
                    this.dspInChannnels[i] = this.HEAPF32.subarray(dspInChans[i] >> 2, (dspInChans[i] + this.bufferSize * this.sampleSize) >> 2);
                }
            }
            if (this.numOut > 0) {
                this.$outs = this.$$audioHeapOutputs;
                if (this.voices) this.$mixing = this.$$audioHeapMixing;
                for (let i = 0; i < this.numOut; i++) {
                    this.HEAP32[(this.$outs >> 2) + i] = this.$audioHeapOutputs + this.bufferSize * this.sampleSize * i;
                    if (this.voices) this.HEAP32[(this.$mixing >> 2) + i] = this.$audioHeapMixing + this.bufferSize * this.sampleSize * i;
                }
                // Prepare Out buffer tables
                const dspOutChans = this.HEAP32.subarray(this.$outs >> 2, (this.$outs + this.numOut * this.ptrSize) >> 2);
                for (let i = 0; i < this.numOut; i++) {
                    this.dspOutChannnels[i] = this.HEAPF32.subarray(dspOutChans[i] >> 2, (dspOutChans[i] + this.bufferSize * this.sampleSize) >> 2);
                }
            }
            // Parse UI
            this.parseUI(this.dspMeta.ui);
            if (this.effect) this.parseUI(this.effectMeta.ui);

            // keep 'keyOn/keyOff' labels
            if (this.voices) {
                this.inputsItems.forEach((item) => {
                    if (item.endsWith("/gate")) this.fGateLabel$.push(this.pathTable$[item]);
                    else if (item.endsWith("/freq")) this.fFreqLabel$.push(this.pathTable$[item]);
                    else if (item.endsWith("/gain")) this.fGainLabel$.push(this.pathTable$[item]);
                });
                // Init DSP voices
                this.dspVoices$.forEach($voice => this.factory.init($voice, sampleRate));
                // Init effect
                if (this.effect) this.effect.init(this.$effect, sampleRate);
            } else {
                // Init DSP
                this.factory.init(this.$dsp, sampleRate); // 'sampleRate' is defined in AudioWorkletGlobalScope
            }
        }
        // Poly only methods
        getPlayingVoice(pitch: number) {
            if (!this.voices) return null;
            let voice = this.kNoVoice;
            let oldestDatePlaying = Number.MAX_VALUE;
            for (let i = 0; i < this.voices; i++) {
                if (this.dspVoicesState[i] === pitch) {
                    // Keeps oldest playing voice
                    if (this.dspVoicesDate[i] < oldestDatePlaying) {
                        oldestDatePlaying = this.dspVoicesDate[i];
                        voice = i;
                    }
                }
            }
            return voice;
        }
        allocVoice(voice: number) {
            if (!this.voices) return null;
            // so that envelop is always re-initialized
            this.factory.instanceClear(this.dspVoices$[voice]);
            this.dspVoicesDate[voice] = this.fDate++;
            this.dspVoicesState[voice] = this.kActiveVoice;
            return voice;
        }
        getFreeVoice() {
            if (!this.voices) return null;
            for (let i = 0; i < this.voices; i++) {
                if (this.dspVoicesState[i] === this.kFreeVoice) return this.allocVoice(i);
            }
            let voiceRelease = this.kNoVoice;
            let voicePlaying = this.kNoVoice;
            let oldestDateRelease = Number.MAX_VALUE;
            let oldestDatePlaying = Number.MAX_VALUE;
            for (let i = 0; i < this.voices; i++) { // Scan all voices
                // Try to steal a voice in kReleaseVoice mode...
                if (this.dspVoicesState[i] === this.kReleaseVoice) {
                    // Keeps oldest release voice
                    if (this.dspVoicesDate[i] < oldestDateRelease) {
                        oldestDateRelease = this.dspVoicesDate[i];
                        voiceRelease = i;
                    }
                } else if (this.dspVoicesDate[i] < oldestDatePlaying) {
                    oldestDatePlaying = this.dspVoicesDate[i];
                    voicePlaying = i;
                }
            }
            // Then decide which one to steal
            if (oldestDateRelease !== Number.MAX_VALUE) {
                // console.log(`Steal release voice : voice_date = ${this.dspVoicesDate[voiceRelease]} cur_date = ${this.fDate} voice = ${voiceRelease}`);
                return this.allocVoice(voiceRelease);
            }
            if (oldestDatePlaying !== Number.MAX_VALUE) {
                // console.log(`Steal playing voice : voice_date = ${this.dspVoicesDate[voicePlaying]} cur_date = ${this.fDate} voice = ${voicePlaying}`);
                return this.allocVoice(voicePlaying);
            }
            return this.kNoVoice;
        }
        keyOn(channel: number, pitch: number, velocity: number) {
            if (!this.voices) return;
            const voice = this.getFreeVoice();
            // console.log("keyOn voice " + voice);
            this.fFreqLabel$.forEach($ => this.factory.setParamValue(this.dspVoices$[voice], $, FaustConst.midiToFreq(pitch)));
            this.fGateLabel$.forEach($ => this.factory.setParamValue(this.dspVoices$[voice], $, 1));
            this.fGainLabel$.forEach($ => this.factory.setParamValue(this.dspVoices$[voice], $, velocity / 127));
            this.dspVoicesState[voice] = pitch;
        }
        keyOff(channel: number, pitch: number, velocity: number) { // eslint-disable-line @typescript-eslint/no-unused-vars
            if (!this.voices) return;
            const voice = this.getPlayingVoice(pitch);
            if (voice === this.kNoVoice) return; // console.log("Playing voice not found...");
            // console.log("keyOff voice " + voice);
            this.fGateLabel$.forEach($ => this.factory.setParamValue(this.dspVoices$[voice], $, 0)); // No use of velocity for now...
            this.dspVoicesState[voice] = this.kReleaseVoice; // Release voice
        }
        allNotesOff() {
            if (!this.voices) return;
            for (let i = 0; i < this.voices; i++) {
                this.fGateLabel$.forEach($gate => this.factory.setParamValue(this.dspVoices$[i], $gate, 0));
                this.dspVoicesState[i] = this.kReleaseVoice;
            }
        }

        midiMessage(data: number[] | Uint8Array) {
            const cmd = data[0] >> 4;
            const channel = data[0] & 0xf;
            const data1 = data[1];
            const data2 = data[2];
            if (channel === 9) return undefined;
            if (cmd === 8 || (cmd === 9 && data2 === 0)) return this.keyOff(channel, data1, data2);
            if (cmd === 9) return this.keyOn(channel, data1, data2);
            if (cmd === 11) return this.ctrlChange(channel, data1, data2);
            if (cmd === 14) return this.pitchWheel(channel, (data2 * 128.0 + data1 - 8192) / 8192);
            return undefined;
        }
        ctrlChange(channel: number, ctrl: number, value: number) {
            if (!this.fCtrlLabel[ctrl].length) return;
            this.fCtrlLabel[ctrl].forEach((ctrl) => {
                const { path } = ctrl;
                this.setParamValue(path, FaustConst.remap(value, 0, 127, ctrl.min, ctrl.max));
                if (this.outputHandler) this.outputHandler(path, this.getParamValue(path));
            });
        }
        pitchWheel(channel: number, wheel: number) {
            this.fPitchwheelLabel.forEach((path) => {
                this.setParamValue(path, Math.pow(2, wheel / 12));
                if (this.outputHandler) this.outputHandler(path, this.getParamValue(path));
            });
        }
        process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any) { // eslint-disable-line @typescript-eslint/no-unused-vars
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
                for (let chan = 0; chan < Math.min(this.numIn, input.length); ++chan) {
                    const dspInput = this.dspInChannnels[chan];
                    dspInput.set(input[chan]);
                }
            }
            /*
            // Update controls (possibly needed for sample accurate control)
            for (const key in parameters) {
                const value = parameters[key];
                this.HEAPF32[this.pathTable$[key] >> 2] = value[0];
            }*/
            // Possibly call an externally given callback (for instance to synchronize playing a MIDIFile...)
            if (this.computeHandler) this.computeHandler(this.bufferSize);
            if (this.voices) {
                this.mixer.clearOutput(this.bufferSize, this.numOut, this.$outs); // First clear the outputs
                for (let i = 0; i < this.voices; i++) { // Compute all running voices
                    if (this.dspVoicesState[i] === this.kFreeVoice) continue;
                    this.factory.compute(this.dspVoices$[i], this.bufferSize, this.$ins, this.$mixing); // Compute voice
                    this.dspVoicesLevel[i] = this.mixer.mixVoice(this.bufferSize, this.numOut, this.$mixing, this.$outs); // Mix it in result
                    // Check the level to possibly set the voice in kFreeVoice again
                    if (this.dspVoicesLevel[i] < 0.0005 && this.dspVoicesState[i] === this.kReleaseVoice) {
                        this.dspVoicesState[i] = this.kFreeVoice;
                    }
                }
                if (this.effect) this.effect.compute(this.$effect, this.bufferSize, this.$outs, this.$outs); // Apply effect. Not a typo, effect is applied on the outs.
            } else {
                this.factory.compute(this.$dsp, this.bufferSize, this.$ins, this.$outs); // Compute
            }
            // Update bargraph
            this.updateOutputs();
            // Copy outputs
            if (output !== undefined) {
                for (let i = 0; i < Math.min(this.numOut, output.length); i++) {
                    const dspOutput = this.dspOutChannnels[i];
                    output[i].set(dspOutput);
                    if (this.plot && this.$plot < this.plot) { // Plot
                        this.plotted[i].set(this.plot - this.$plot >= this.bufferSize ? dspOutput : dspOutput.subarray(0, this.plot - this.$plot), this.$plot);
                        if (i === Math.min(this.numOut, output.length) - 1) { // Last channel
                            this.$plot += this.bufferSize;
                            if (this.plot - this.$plot <= this.bufferSize) this.port.postMessage({ type: "plot", value: this.plotted }); // Last buffer
                        }
                    }
                }
            }
            return true;
        }
        printMemory() {
            console.log("============== Memory layout ==============");
            console.log("dspMeta.size: " + this.dspMeta.size);
            console.log("$audioHeap: " + this.$audioHeap);
            console.log("$$audioHeapInputs: " + this.$$audioHeapInputs);
            console.log("$$audioHeapOutputs: " + this.$$audioHeapOutputs);
            console.log("$$audioHeapMixing: " + this.$$audioHeapMixing);
            console.log("$audioHeapInputs: " + this.$audioHeapInputs);
            console.log("$audioHeapOutputs: " + this.$audioHeapOutputs);
            console.log("$audioHeapMixing: " + this.$audioHeapMixing);
            console.log("$dsp: " + this.$dsp);
            if (this.dspVoices$) this.dspVoices$.forEach(($voice, i) => console.log("dspVoices$[" + i + "]: " + $voice));
            console.log("$effect: " + this.$effect);
            console.log("$mixing: " + this.$mixing);
        }
    }

    // Globals
    // Synchronously compile and instantiate the WASM module
    registerProcessor(FaustConst.id || "mydsp", FaustAudioWorkletProcessor);
};
