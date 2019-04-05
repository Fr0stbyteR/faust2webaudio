import { Faust, mixer32Base64Code } from "./Faust";
import { FaustScriptProcessorNode } from "./FaustScriptProcessorNode";
import { FaustWebAssemblyExports } from "./FaustWebAssemblyExports";
import { TCompiledDsp } from "./types";
const b64ToUint6 = (nChr: number) => {
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
};
const atoAB = (sBase64: string, nBlocksSize?: number) => {
    // if (typeof atob === "function") return atob(sBase64); It does not return an ArrayBuffer
    const sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, "");
    const nInLen = sB64Enc.length;
    const nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2;
    const taBytes = new Uint8Array(nOutLen);
    for (let nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
        nMod4 = nInIdx & 3;
        nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
        if (nMod4 === 3 || nInLen - nInIdx === 1) {
            for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
                taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
            }
            nUint24 = 0;
        }
    }
    return taBytes.buffer;
};
export class FaustWasmToScriptProcessor {
    private static heap2Str = (buf: number[]) => {
        let str = "";
        let i = 0;
        while (buf[i] !== 0) {
            str += String.fromCharCode(buf[i++]);
        }
        return str;
    }
    private static get importObject() {
        return {
            env: {
                memory: undefined as WebAssembly.Memory, memoryBase: 0, tableBase: 0,
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
                _acosh: Math.acosh, _asinh: Math.asinh, _atanh: Math.atanh, 
                _cosh: Math.cosh, _sinh: Math.sinh, _tanh: Math.tanh,
                table: new WebAssembly.Table({ initial: 0, element: "anyfunc" })
            }
        };
    }
    faust: Faust;
    constructor(faust: Faust) {
        this.faust = faust;
    }
    private initNode(compiledDsp: TCompiledDsp, dspInstance: WebAssembly.Instance, effectInstance: WebAssembly.Instance, mixerInstance: WebAssembly.Instance, audioCtx: AudioContext, bufferSize?: number, memory?: WebAssembly.Memory, voices?: number) {
        let node: FaustScriptProcessorNode;
        const dspMeta = compiledDsp.dspHelpers.meta;
        const inputs = parseInt(dspMeta.inputs);
        const outputs = parseInt(dspMeta.outputs);
        try {
            node = audioCtx.createScriptProcessor(bufferSize, inputs, outputs) as FaustScriptProcessorNode;
        } catch (e) {
            this.faust.error("Error in createScriptProcessor: " + e);
            throw(e);
        }
        node.voices = voices;
        node.dspMeta = dspMeta;

        node.outputHandler = null;
        node.computeHandler = null;
        node.$ins = null;
        node.$outs = null;

        node.dspInChannnels = [];
        node.dspOutChannnels = [];

        node.fPitchwheelLabel = [];
        // tslint:disable-next-line: prefer-array-literal
        node.fCtrlLabel = new Array(128).fill(null).map(() => []);

        node.numIn = inputs;
        node.numOut = outputs;

        this.faust.log(node.numIn);
        this.faust.log(node.numOut);

        // Memory allocator
        node.ptrSize = 4;
        node.sampleSize = 4;

        node.factory = dspInstance.exports as FaustWebAssemblyExports;
        node.HEAP = node.voices ? memory.buffer : node.factory.memory.buffer;
        node.HEAP32 = new Int32Array(node.HEAP);
        node.HEAPF32 = new Float32Array(node.HEAP);

        this.faust.log(node.HEAP);
        this.faust.log(node.HEAP32);
        this.faust.log(node.HEAPF32);

        // JSON is as offset 0
        /*
        var HEAPU8 = new Uint8Array(sp.HEAP);
        console.log(this.Heap2Str(HEAPU8));
        */
        // bargraph
        node.outputsTimer = 5;
        node.outputsItems = [];

        // input items
        node.inputsItems = [];

        // Start of HEAP index

        // DSP is placed first with index 0. Audio buffer start at the end of DSP.
        node.$audioHeap = node.voices ? 0 : parseInt(node.dspMeta.size);

        // Setup pointers offset
        node.$$audioHeapInputs = node.$audioHeap;
        node.$$audioHeapOutputs = node.$$audioHeapInputs + node.numIn * node.ptrSize;
        if (node.voices) {
            node.$$audioHeapMixing = node.$$audioHeapOutputs + node.numOut * node.ptrSize;
            // Setup buffer offset
            node.$audioHeapInputs = node.$$audioHeapMixing + node.numOut * node.ptrSize;
            node.$audioHeapOutputs = node.$audioHeapInputs + node.numIn * node.bufferSize * node.sampleSize;
            node.$audioHeapMixing = node.$audioHeapOutputs + node.numOut * node.bufferSize * node.sampleSize;
            node.$dsp = node.$audioHeapMixing + node.numOut * node.bufferSize * node.sampleSize;
        } else {
            node.$audioHeapInputs = node.$$audioHeapOutputs + node.numOut * node.ptrSize;
            node.$audioHeapOutputs = node.$audioHeapInputs + node.numIn * node.bufferSize * node.sampleSize;
            // Start of DSP memory : Mono DSP is placed first with index 0
            node.$dsp = 0;
        }

        if (node.voices) {
            node.effectMeta = compiledDsp.effectHelpers ? compiledDsp.effectHelpers.meta : null;
            node.$mixing = null;
            node.fFreqLabel$ = [];
            node.fGateLabel$ = [];
            node.fGainLabel$ = [];
            node.fDate = 0;

            node.mixer = mixerInstance.exports;
            node.effect = effectInstance ? effectInstance.exports : null;
            this.faust.log(node.mixer);
            this.faust.log(node.factory);
            this.faust.log(node.effect);
            // Start of DSP memory ('polyphony' DSP voices)
            node.dspVoices$ = [];
            node.dspVoicesState = [];
            node.dspVoicesLevel = [];
            node.dspVoicesDate = [];

            node.kActiveVoice = 0;
            node.kFreeVoice = -1;
            node.kReleaseVoice = -2;
            node.kNoVoice = -3;

            for (let i = 0; i < node.voices; i++) {
                node.dspVoices$[i] = node.$dsp + i * parseInt(node.dspMeta.size);
                node.dspVoicesState[i] = node.kFreeVoice;
                node.dspVoicesLevel[i] = 0;
                node.dspVoicesDate[i] = 0;
            }
            // Effect memory starts after last voice
            node.$effect = node.dspVoices$[node.voices - 1] + parseInt(node.dspMeta.size);
        }

        node.pathTable$ = {};

        node.updateOutputs = () => {
            if (node.outputsItems.length > 0 && node.outputHandler && node.outputsTimer-- === 0) {
                node.outputsTimer = 5;
                node.outputsItems.forEach(item => node.outputHandler(item, node.factory.getParamValue(node.$dsp, node.pathTable$[item])));
            }
        };

        // JSON parsing
        node.parseUI = ui => ui.forEach(group => node.parseGroup(group));
        node.parseGroup = group => group.items ? node.parseItems(group.items) : null;
        node.parseItems = items => items.forEach(item => node.parseItem(item));
        node.parseItem = (item) => {
            if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
                node.parseItems(item.items);
            } else if (item.type === "hbargraph" || item.type === "vbargraph") {
                // Keep bargraph adresses
                node.outputsItems.push(item.address);
                node.pathTable$[item.address] = parseInt(item.index);
            } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
                // Keep inputs adresses
                node.inputsItems.push(item.address);
                node.pathTable$[item.address] = parseInt(item.index);
                if (!item.meta) return;
                item.meta.forEach((meta) => {
                    const midi = meta.midi;
                    if (!midi) return;
                    const strMidi = midi.trim();
                    if (strMidi === "pitchwheel") {
                        node.fPitchwheelLabel.push(item.address);
                    } else {
                        const matched = strMidi.match(/^ctrl\s(\d+)/);
                        if (!matched) return;
                        node.fCtrlLabel[parseInt(matched[1])].push({ path: item.address, min: parseFloat(item.min), max: parseFloat(item.max) });
                    }
                });
            }
        };

        if (node.voices) {
            node.getPlayingVoice = (pitch) => {
                let voice = node.kNoVoice;
                let oldestDatePlaying = Number.MAX_VALUE;
                for (let i = 0; i < node.voices; i++) {
                    if (node.dspVoicesState[i] === pitch) {
                        // Keeps oldest playing voice
                        if (node.dspVoicesDate[i] < oldestDatePlaying) {
                            oldestDatePlaying = node.dspVoicesDate[i];
                            voice = i;
                        }
                    }
                }
                return voice;
            };
            // Always returns a voice
            node.allocVoice = (voice) => {
                // so that envelop is always re-initialized
                node.factory.instanceClear(node.dspVoices$[voice]);
                node.dspVoicesDate[voice] = node.fDate++;
                node.dspVoicesState[voice] = node.kActiveVoice;
                return voice;
            };
            node.getFreeVoice = () => {
                for (let i = 0; i < node.voices; i++) {
                    if (node.dspVoicesState[i] === node.kFreeVoice) return node.allocVoice(i);
                }
                let voiceRelease = node.kNoVoice;
                let voicePlaying = node.kNoVoice;
                let oldestDateRelease = Number.MAX_VALUE;
                let oldestDatePlaying = Number.MAX_VALUE;
                for (let i = 0; i < node.voices; i++) { // Scan all voices
                    // Try to steal a voice in kReleaseVoice mode...
                    if (node.dspVoicesState[i] === node.kReleaseVoice) {
                        // Keeps oldest release voice
                        if (node.dspVoicesDate[i] < oldestDateRelease) {
                            oldestDateRelease = node.dspVoicesDate[i];
                            voiceRelease = i;
                        }
                    } else {
                        if (node.dspVoicesDate[i] < oldestDatePlaying) {
                            oldestDatePlaying = node.dspVoicesDate[i];
                            voicePlaying = i;
                        }
                    }
                }
                // Then decide which one to steal
                if (oldestDateRelease !== Number.MAX_VALUE) {
                    this.faust.log(`Steal release voice : voice_date = ${node.dspVoicesDate[voiceRelease]} cur_date = ${node.fDate} voice = ${voiceRelease}`);
                    return node.allocVoice(voiceRelease);
                }
                if (oldestDatePlaying !== Number.MAX_VALUE) {
                    this.faust.log(`Steal playing voice : voice_date = ${node.dspVoicesDate[voicePlaying]} cur_date = ${node.fDate} voice = ${voicePlaying}`);
                    return node.allocVoice(voicePlaying);
                }
                return node.kNoVoice;
            };
            const midiToFreq = (note: number) => 440.0 * Math.pow(2.0, (note - 69.0) / 12.0);
            node.keyOn = (channel, pitch, velocity) => {
                const voice = node.getFreeVoice();
                this.faust.log("keyOn voice " + voice);
                node.fFreqLabel$.forEach($ => node.factory.setParamValue(node.dspVoices$[voice], $, midiToFreq(pitch)));
                node.fGateLabel$.forEach($ => node.factory.setParamValue(node.dspVoices$[voice], $, 1));
                node.fGainLabel$.forEach($ => node.factory.setParamValue(node.dspVoices$[voice], $, velocity / 127));
                node.dspVoicesState[voice] = pitch;
            };
            node.keyOff = (channel, pitch, velocity) => {
                const voice = node.getPlayingVoice(pitch);
                if (voice === node.kNoVoice) return this.faust.log("Playing voice not found...");
                this.faust.log("keyOff voice " + voice);
                node.fGateLabel$.forEach($ => node.factory.setParamValue(node.dspVoices$[voice], $, 0)); // No use of velocity for now...
                node.dspVoicesState[voice] = node.kReleaseVoice; // Release voice
            };
            node.allNotesOff = () => {
                for (let i = 0; i < node.voices; i++) {
                    node.fGateLabel$.forEach($gate => node.factory.setParamValue(node.dspVoices$[i], $gate, 0));
                    node.dspVoicesState[i] = node.kReleaseVoice;
                }
            };
        }
        node.midiMessage = (data) => {
            const cmd = data[0] >> 4;
            const channel = data[0] & 0xf;
            const data1 = data[1];
            const data2 = data[2];
            if (channel === 9) return;
            if (node.voices) {
                if (cmd === 8 || (cmd === 9 && data2 === 0)) return node.keyOff(channel, data1, data2);
                if (cmd === 9) return node.keyOn(channel, data1, data2);
            }
            if (cmd === 11) return node.ctrlChange(channel, data1, data2);
            if (cmd === 14) return node.pitchWheel(channel, (data2 * 128.0 + data1 - 8192) / 8192);
        };
        const remap = (v: number, mn0: number, mx0: number, mn1: number, mx1: number) => (v - mn0) / (mx0 - mn0) * (mx1 - mn1) + mn1;
        node.ctrlChange = (channel, ctrl, value) => {
            if (!node.fCtrlLabel[ctrl].length) return;
            node.fCtrlLabel[ctrl].forEach((ctrl) => {
                const path = ctrl.path;
                node.setParamValue(path, remap(value, 0, 127, ctrl.min, ctrl.max));
                if (node.outputHandler) node.outputHandler(path, node.getParamValue(path));
            });
        };
        node.pitchWheel = (channel, wheel) => {
            node.fPitchwheelLabel.forEach((path) => {
                node.setParamValue(path, Math.pow(2, wheel / 12));
                if (node.outputHandler) node.outputHandler(path, node.getParamValue(path));
            });
        };
        node.compute = (e) => {
            for (let i = 0; i < node.numIn; i++) { // Read inputs
                const input = e.inputBuffer.getChannelData(i);
                const dspInput = node.dspInChannnels[i];
                dspInput.set(input);
            }
            // Possibly call an externally given callback (for instance to synchronize playing a MIDIFile...)
            if (node.computeHandler) node.computeHandler(node.bufferSize);
            if (node.voices) {
                node.mixer.clearOutput(node.bufferSize, node.numOut, node.$outs); // First clear the outputs
                for (let i = 0; i < node.voices; i++) { // Compute all running voices
                    if (node.dspVoicesState[i] === node.kFreeVoice) continue;
                    node.factory.compute(node.dspVoices$[i], node.bufferSize, node.$ins, node.$mixing); // Compute voice
                    node.dspVoicesLevel[i] = node.mixer.mixVoice(node.bufferSize, node.numOut, node.$mixing, node.$outs); // Mix it in result
                    // Check the level to possibly set the voice in kFreeVoice again
                    if (node.dspVoicesLevel[i] < 0.0005 && node.dspVoicesState[i] === node.kReleaseVoice) {
                        node.dspVoicesState[i] = node.kFreeVoice;
                    }
                }
                if (node.effect) node.effect.compute(node.$effect, node.bufferSize, node.$outs, node.$outs); // Apply effect. Not a typo, effect is applied on the outs.
            } else {
                node.factory.compute(node.$dsp, node.bufferSize, node.$ins, node.$outs); // Compute
            }
            node.updateOutputs(); // Update bargraph
            for (let i = 0; i < node.numOut; i++) { // Write outputs
                const output = e.outputBuffer.getChannelData(i);
                const dspOutput = node.dspOutChannnels[i];
                output.set(dspOutput);
            }
        };
        node.setup = () => { // Setup web audio context
            this.faust.log("buffer_size " + node.bufferSize);
            node.onaudioprocess = node.compute;
            if (node.numIn > 0) {
                node.$ins = node.$$audioHeapInputs;
                for (let i = 0; i < node.numIn; i++) {
                    node.HEAP32[(node.$ins >> 2) + i] = node.$audioHeapInputs + node.bufferSize * node.sampleSize * i;
                }
                // Prepare Ins buffer tables
                const dspInChans = node.HEAP32.subarray(node.$ins >> 2, (node.$ins + node.numIn * node.ptrSize) >> 2);
                for (let i = 0; i < node.numIn; i++) {
                    node.dspInChannnels[i] = node.HEAPF32.subarray(dspInChans[i] >> 2, (dspInChans[i] + node.bufferSize * node.sampleSize) >> 2);
                }
            }
            if (node.numOut > 0) {
                node.$outs = node.$$audioHeapOutputs;
                if (node.voices) node.$mixing = node.$$audioHeapMixing;
                for (let i = 0; i < node.numOut; i++) {
                    node.HEAP32[(node.$outs >> 2) + i] = node.$audioHeapOutputs + node.bufferSize * node.sampleSize * i;
                    if (node.voices) node.HEAP32[(node.$mixing >> 2) + i] = node.$audioHeapMixing + node.bufferSize * node.sampleSize * i;
                }
                // Prepare Out buffer tables
                const dspOutChans = node.HEAP32.subarray(node.$outs >> 2, (node.$outs + node.numOut * node.ptrSize) >> 2);
                for (let i = 0; i < node.numOut; i++) {
                    node.dspOutChannnels[i] = node.HEAPF32.subarray(dspOutChans[i] >> 2, (dspOutChans[i] + node.bufferSize * node.sampleSize) >> 2);
                }
            }
            // Parse JSON UI part
            node.parseUI(node.dspMeta.ui);
            if (node.effect) node.parseUI(node.effectMeta.ui);

            // keep 'keyOn/keyOff' labels
            if (node.voices) {
                node.inputsItems.forEach((item) => {
                    if (item.endsWith("/gate")) node.fGateLabel$.push(node.pathTable$[item]);
                    else if (item.endsWith("/freq")) node.fFreqLabel$.push(node.pathTable$[item]);
                    else if (item.endsWith("/gain")) node.fGainLabel$.push(node.pathTable$[item]);
                });
                // Init DSP voices
                node.dspVoices$.forEach($voice => node.factory.init($voice, audioCtx.sampleRate));
                // Init effect
                if (node.effect) node.effect.init(node.$effect, audioCtx.sampleRate);
            } else {
                // Init DSP
                node.factory.init(node.$dsp, audioCtx.sampleRate);
            }
        };
        node.getSampleRate = () => audioCtx.sampleRate;
        node.getNumInputs = () => node.numIn;
        node.getNumOutputs = () => node.numOut;
        node.init = (sampleRate) => {
            if (node.voices) node.dspVoices$.forEach($voice => node.factory.init($voice, sampleRate));
            else node.factory.init(node.$dsp, sampleRate);
        };
        node.instanceInit = (sampleRate) => {
            if (node.voices) node.dspVoices$.forEach($voice => node.factory.instanceInit($voice, sampleRate));
            else node.factory.instanceInit(node.$dsp, sampleRate);
        };
        node.instanceConstants = (sampleRate) => {
            if (node.voices) node.dspVoices$.forEach($voice => node.factory.instanceConstants($voice, sampleRate));
            else node.factory.instanceConstants(node.$dsp, sampleRate);
        };
        node.instanceResetUserInterface = () => {
            if (node.voices) node.dspVoices$.forEach($voice => node.factory.instanceResetUserInterface($voice));
            else node.factory.instanceResetUserInterface(node.$dsp);
        };
        node.instanceClear = () => {
            if (node.voices) node.dspVoices$.forEach($voice => node.factory.instanceClear($voice));
            else node.factory.instanceClear(node.$dsp);
        };
        node.metadata = handler => node.dspMeta.meta ? node.dspMeta.meta.forEach(meta => handler.declare(Object.keys(meta)[0], meta[Object.keys(meta)[0]])) : undefined;
        node.setOutputParamHandler = handler => node.outputHandler = handler;
        node.getOutputParamHandler = () => node.outputHandler;
        node.setComputeHandler = handler => node.computeHandler = handler;
        node.getComputeHandler = () => node.computeHandler;
        const findPath = (o: any, p: string) => {
            if (typeof o !== "object") return false;
            if (o.address) {
                if (o.address === p) return true;
                return false;
            }
            for (const k in o) {
                if (findPath(o[k], p)) return true;
            }
            return false;
        };
        node.setParamValue = (path, val) => {
            if (node.voices) {
                if (node.effect && findPath(node.effectMeta.ui, path)) node.effect.setParamValue(node.$effect, node.pathTable$[path], val);
                else node.dspVoices$.forEach($voice => node.factory.setParamValue($voice, node.pathTable$[path], val));
            } else {
                node.factory.setParamValue(node.$dsp, node.pathTable$[path], val);
            }
        };
        node.getParamValue = (path) => {
            if (node.voices) {
                if (node.effect && findPath(node.effectMeta.ui, path)) return node.effect.getParamValue(node.$effect, node.pathTable$[path]);
                return node.factory.getParamValue(node.dspVoices$[0], node.pathTable$[path]);
            }
            return node.factory.getParamValue(node.$dsp, node.pathTable$[path]);
        };
        node.getParams = () => node.inputsItems;
        node.getJSON = () => {
            if (node.voices) {
                const o = node.dspMeta;
                const e = node.effectMeta;
                const r = { ...o };
                if (e) {
                    r.ui = [{ type: "tgroup", label: "Sequencer", items: [
                        { type: "vgroup", label: "Instrument", items: o.ui },
                        { type: "vgroup", label: "Effect", items: e.ui }
                    ] }];
                } else {
                    r.ui = [{ type: "tgroup", label: "Polyphonic", items: [
                        { type: "vgroup", label: "Voices", items: o.ui }
                    ] }];
                }
                return JSON.stringify(r);
            }
            return JSON.stringify(node.dspMeta);
        };
        // Init resulting DSP
        node.setup();
        return node;
    }
    /**
     * Create a ScriptProcessorNode Web Audio object
     * by loading and compiling the Faust wasm file
     *
     * @param {TCompiledDsp} compiledDsp - DSP Module compiled by libfaust
     * @param {AudioContext} audioCtx - the Web Audio context
     * @param {number} bufferSize - the bufferSize in frames
     * @param {string} [mixerPath] - the path of polyphony mixer
     * @param {number} [voices] - polyphony voices
     * @returns {Promise<ScriptProcessorNode>} a Promise for valid WebAudio ScriptProcessorNode object or null
     */
    async getNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSizeIn: number, voices?: number) {
        const bufferSize = bufferSizeIn || 512;
        let node: FaustScriptProcessorNode;
        const importObject = FaustWasmToScriptProcessor.importObject;
        try {
            let effectInstance: WebAssembly.Instance;
            let mixerInstance: WebAssembly.Instance;
            let memory: WebAssembly.Memory;
            if (voices) {
                memory = FaustWasmToScriptProcessor.createMemory(compiledDsp, bufferSize, voices);
                importObject.env.memory = memory;
                const mixerObject = { imports: { print: console.log }, memory: { memory } };
                const mixerModule = new WebAssembly.Module(atoAB(mixer32Base64Code));
                mixerInstance = new WebAssembly.Instance(mixerModule, mixerObject);
                try {
                    effectInstance = await WebAssembly.instantiate(compiledDsp.effectModule, importObject);
                } catch (e) {}
            }
            const dspInstance = await WebAssembly.instantiate(compiledDsp.dspModule, importObject);
            node = this.initNode(compiledDsp, dspInstance, effectInstance, mixerInstance, audioCtx, bufferSize, memory, voices);
        } catch (e) {
            this.faust.error("Faust " + compiledDsp.codes.dspName + " cannot be loaded or compiled");
            throw(e);
        }
        return node;
    }
    private static createMemory(compiledDsp: TCompiledDsp, bufferSize: number, voices: number) {
        // Memory allocator
        const ptrSize = 4;
        const sampleSize = 4;
        const pow2limit = (x: number) => {
            let n = 65536; // Minimum = 64 kB
            while (n < x) { n = 2 * n; }
            return n;
        };
        const dspMeta = compiledDsp.dspHelpers.meta;
        const effectMeta = compiledDsp.effectHelpers ? compiledDsp.effectHelpers.meta : null;
        const effectSize = effectMeta ? parseInt(effectMeta.size) : 0;
        let memorySize = pow2limit(
            effectSize
            + parseInt(dspMeta.size) * voices
            + (parseInt(dspMeta.inputs) + parseInt(dspMeta.outputs) * 2)
            * (ptrSize + bufferSize * sampleSize)
        ) / 65536;
        memorySize = Math.max(2, memorySize); // As least 2
        return new WebAssembly.Memory({ initial: memorySize, maximum: memorySize });
    }
}
