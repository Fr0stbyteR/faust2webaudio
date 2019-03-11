import { Faust } from "./index";
import { FaustScriptProcessorNode } from "./FaustScriptProcessorNode";
import { FaustWebAssemblyExports } from "./FaustWebAssemblyExports";
import { TCompiledDsp } from "./types";
export class FaustWasmToScriptProcessor {
    private static heap2Str = (buf: number[]) => {
        let str = "";
        let i = 0;
        while (buf[i] !== 0) {
            str += String.fromCharCode(buf[i++]);
        }
        return str;
    }
    private static importObject = {
        env: {
            memoryBase: 0, tableBase: 0,
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
    faust: Faust;

    constructor(faust: Faust) {
        this.faust = faust;
    }
    private initNode(compiledDsp: TCompiledDsp, dspInstance: WebAssembly.Instance, audioCtx: AudioContext, bufferSize: number) {
        let node: FaustScriptProcessorNode;
        const dspMeta = compiledDsp.dspHelpers.meta;
        const inputs = parseInt(dspMeta.inputs);
        const outputs = parseInt(dspMeta.outputs);
        try {
            node = audioCtx.createScriptProcessor(bufferSize, inputs, outputs) as FaustScriptProcessorNode;
        } catch (e) {
            this.faust.error("Error in createScriptProcessor: " + e);
            return null;
        }
        node.meta = dspMeta;

        node.outputHandler = null;
        node.$ins = null;
        node.$outs = null;
        node.computeHandler = null;

        node.dspInChannnels = [];
        node.dspOutChannnels = [];

        node.fPitchwheelLabel = [];
        // tslint:disable-next-line: prefer-array-literal
        node.fCtrlLabel = new Array(128).fill(null).map(() => []),

        node.numIn = inputs;
        node.numOut = outputs;

        this.faust.log(node.numIn);
        this.faust.log(node.numOut);

        // Memory allocator
        node.ptrSize = 4;
        node.sampleSize = 4;

        node.factory = dspInstance.exports as FaustWebAssemblyExports;
        node.HEAP = node.factory.memory.buffer;
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
        node.$audioHeap = parseInt(dspMeta.size);

        // Setup pointers offset
        node.$$audioHeapInputs = node.$audioHeap;
        node.$$audioHeapOutputs = node.$$audioHeapInputs + node.numIn * node.ptrSize;

        // Setup buffer offset
        node.$audioHeapInputs = node.$$audioHeapOutputs + node.numOut * node.ptrSize;
        node.$audioHeapOutputs = node.$audioHeapInputs + node.numIn * bufferSize * node.sampleSize;

        // Start of DSP memory : DSP is placed first with index 0
        node.$dsp = 0;

        node.pathTable$ = {};

        node.updateOutputs = () => {
            if (node.outputsItems.length > 0 && node.outputHandler && node.outputsTimer-- === 0) {
                node.outputsTimer = 5;
                node.outputsItems.forEach(item => node.outputHandler(item, node.factory.getParamValue(node.$dsp, node.pathTable$[item])));
            }
        };

        node.compute = (e) => {
            for (let i = 0; i < node.numIn; i++) { // Read inputs
                const input = e.inputBuffer.getChannelData(i);
                const dspInput = node.dspInChannnels[i];
                dspInput.set(input);
            }
            // Possibly call an externally given callback (for instance to synchronize playing a MIDIFile...)
            if (node.computeHandler) node.computeHandler(bufferSize);
            node.factory.compute(node.$dsp, bufferSize, node.$ins, node.$outs); // Compute
            node.updateOutputs(); // Update bargraph
            for (let i = 0; i < node.numOut; i++) { // Write outputs
                const output = e.outputBuffer.getChannelData(i);
                const dspOutput = node.dspOutChannnels[i];
                output.set(dspOutput);
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
                        node.fCtrlLabel[parseInt(matched[1])].push({
                            path: item.address,
                            min: parseFloat(item.min),
                            max: parseFloat(item.max)
                        });
                    }
                });
            }
        };
        node.setup = () => { // Setup web audio context
            this.faust.log("buffer_size " + bufferSize);
            node.onaudioprocess = node.compute;
            if (node.numIn > 0) {
                node.$ins = node.$$audioHeapInputs;
                for (let i = 0; i < node.numIn; i++) {
                    node.HEAP32[(node.$ins >> 2) + i] = node.$audioHeapInputs + bufferSize * node.sampleSize * i;
                }
                // Prepare Ins buffer tables
                const dspInChans = node.HEAP32.subarray(node.$ins >> 2, (node.$ins + node.numIn * node.ptrSize) >> 2);
                for (let i = 0; i < node.numIn; i++) {
                    node.dspInChannnels[i] = node.HEAPF32.subarray(dspInChans[i] >> 2, (dspInChans[i] + bufferSize * node.sampleSize) >> 2);
                }
            }
            if (node.numOut > 0) {
                node.$outs = node.$$audioHeapOutputs;
                for (let i = 0; i < node.numOut; i++) {
                    node.HEAP32[(node.$outs >> 2) + i] = node.$audioHeapOutputs + bufferSize * node.sampleSize * i;
                }
                // Prepare Out buffer tables
                const dspOutChans = node.HEAP32.subarray(node.$outs >> 2, (node.$outs + node.numOut * node.ptrSize) >> 2);
                for (let i = 0; i < node.numOut; i++) {
                    node.dspOutChannnels[i] = node.HEAPF32.subarray(dspOutChans[i] >> 2, (dspOutChans[i] + bufferSize * node.sampleSize) >> 2);
                }
            }
            // Parse JSON UI part
            node.parseUI(node.meta.ui);
            // Init DSP
            node.factory.init(node.$dsp, audioCtx.sampleRate);
        };
        node.getSampleRate = () => audioCtx.sampleRate;
        node.getNumInputs = () => node.numIn;
        node.getNumOutputs = () => node.numOut;
        node.init = sampleRate => node.factory.init(node.$dsp, sampleRate);
        node.instanceInit = sampleRate => node.factory.instanceInit(node.$dsp, sampleRate);
        node.instanceConstants = sampleRate => node.factory.instanceConstants(node.$dsp, sampleRate);
        node.instanceResetUserInterface = () => node.factory.instanceResetUserInterface(node.$dsp);
        node.instanceClear = () => node.factory.instanceClear(node.$dsp);
        node.metadata = handler => dspMeta.meta ? dspMeta.meta.forEach(meta => handler.declare(Object.keys(meta)[0], meta[Object.keys(meta)[0]])) : undefined;
        node.setOutputParamHandler = handler => node.outputHandler = handler;
        node.getOutputParamHandler = () => node.outputHandler;
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
        node.setParamValue = (path, val) => node.factory.setParamValue(node.$dsp, node.pathTable$[path], val);
        node.getParamValue = path => node.factory.getParamValue(node.$dsp, node.pathTable$[path]);
        node.getJSON = () => JSON.stringify(dspMeta);
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
     * @returns {Promise<ScriptProcessorNode>} a Promise for valid WebAudio ScriptProcessorNode object or null
     */
    async getNode(compiledDsp: TCompiledDsp, audioCtx: AudioContext, bufferSize: number, mixerPath?: string) {
        let node: FaustScriptProcessorNode;
        try {
            const dspInstance = await WebAssembly.instantiate(compiledDsp.dspModule, FaustWasmToScriptProcessor.importObject);
            node = this.initNode(compiledDsp, dspInstance, audioCtx, bufferSize);
        } catch (e) {
            this.faust.error(e);
            this.faust.error("Faust " + compiledDsp.codes.dspName + " cannot be loaded or compiled");
        }
        return node;
    }
}
