/// <reference types="webassembly-js-api" />

type TDspMeta = {
    name: string;
    filename: string;
    compile_options: string;
    include_pathnames: string[];
    inputs: string;
    outputs: string;
    size: string;
    version: string;
    library_list: string[];
    meta: { [key: string]: string }[];
    ui: TFaustUI;
};
type TFaustUI = TFaustUIGroup[];
type TFaustUIItem = TFaustUIInputItem | TFaustUIOutputItem | TFaustUIGroup;
type TFaustUIInputItem = {
    type: TFaustUIInputType;
    label: string;
    address: string;
    index: string;
    init?: string;
    min?: string;
    max?: string;
    step?: string;
    meta?: any[];
};
type TFaustUIOutputItem = {
    type: TFaustUIOutputType;
    label: string;
    address: string;
    index: string;
    min?: string;
    max?: string;
};
type TFaustUIGroupType = "vgroup" | "hgroup" | "tgroup";
type TFaustUIOutputType = "hbargraph" | "vbargraph";
type TFaustUIInputType = "vslider" | "hslider" | "button" | "checkbox" | "nentry";
type TFaustUIGroup = {
    type: TFaustUIGroupType;
    label: string;
    items: TFaustUIItem[];
}
type TFaustUIType = TFaustUIGroupType | TFaustUIOutputType | TFaustUIInputType;
type TCompiledCode = { ui8Code: ArrayBuffer; code: string; helpersCode: string };
type TCompiledStrCode = { strCode: string; code: string; helpersCode: string };
type TCompiledCodes = { dsp: TCompiledCode; effect?: TCompiledCode};
type TCompiledStrCodes = { dsp: TCompiledStrCode; effect?: TCompiledStrCode};
type THelpers = { json: string; base64Code: string; meta: TDspMeta };
type TCompiledDsp = {
    shaKey: string;
    dspModule: WebAssembly.Module;
    dspHelpers: THelpers;
    effectModule?: WebAssembly.Module;
    effectHelpers?: THelpers;
    codes: TCompiledCodes;
}
type TFaustCompileArgs = {
    /**
     * Flush to zero the code added to recursive signals [0:no (default), 1:fabs based, 2:mask based (fastest)]
     *
     * @type {(0 | 1 | 2)}
     */
    "-ftz"?: 0 | 1 | 2;
    /**
     * Add the directory to the import search path
     *
     * @type {string}
     */
    "-I"?: string;
    [key: string]: any;
}
type TFaustCompileOptions = {
    audioCtx: AudioContext;
    useWorklet?: boolean;
    voices?: number;
    bufferSize?: 128 | 256 | 512 | 1024 | 2048 | 4096;
    args?: TFaustCompileArgs;
    /**
     * first samples to get
     *
     * @type {number}
     */
    plot?: number;
    /**
     * handler for plotted samples
     *
     * @type {(plotted: Float32Array[]) => any}
     */
    plotHandler?: (plotted: Float32Array[]) => any;
}
type TAudioNodeOptions = {
    /**
     * DSP compiled by libfaust
     *
     * @type {TCompiledDsp}
     */
    compiledDsp: TCompiledDsp;
    audioCtx: AudioContext;
    /**
     * Polyphony voices, 0 or undefined for mono DSP
     *
     * @type {number}
     */
    voices?: number;
    /**
     * - the bufferSize in frames
     *
     * @type {(128 | 256 | 512 | 1024 | 2048 | 4096)}
     */
    bufferSize?: 128 | 256 | 512 | 1024 | 2048 | 4096;
    /**
     * first samples to get
     *
     * @type {number}
     */
    plot?: number;
    /**
     * handler for plotted samples
     *
     * @type {(plotted: Float32Array[]) => any}
     */
    plotHandler?: (plotted: Float32Array[]) => any;
}

declare interface FaustWebAssemblyExports {
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

declare interface FaustWebAssemblyMixerExports {
    clearOutput(count: number, channels: number, $outputs: number): void;
    mixVoice(count: number, channels: number, $inputs: number, $outputs: number): number;
}

declare interface FaustDspNode {
    bufferSize: number;
    voices?: number;
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

    outputHandler: (address: string, value: number) => any;
    computeHandler: (bufferSize: number) => any;
    updateOutputs(): void;

    parseUI(ui: TFaustUI): void;
    parseGroup(group: TFaustUIGroup): void;
    parseItems(items: TFaustUIItem[]): void;
    parseItem(ui: TFaustUIItem): void;

    /**
     * Set control value.
     *
     * @param {string} path - the path to the wanted control (retrieved using 'getParams' method)
     * @param {number} val - the float value for the wanted parameter
     * @memberof IFaustDspNode
     */
    setParamValue(path: string, val: number): void;
    /**
     * Get control value.
     *
     * @param {string} path - the path to the wanted control (retrieved using 'controls' method)
     * @returns {number} the float value
     * @memberof IFaustDspNode
     */
    getParamValue(path: string): number;
    /**
     * Setup pointers
     *
     * @memberof IFaustDspNode
     */
    setup(): void;

    // Poly methods
    getPlayingVoice?(pitch: number): number;
    allocVoice?(voice: number): number;
    getFreeVoice?(): number;
    /**
     * Instantiates a new polyphonic voice.
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} pitch - the MIDI pitch (0..127)
     * @param {number} velocity - the MIDI velocity (0..127)
     * @memberof IFaustDspNode
     */
    keyOn?(channel: number, pitch: number, velocity: number): void;
    /**
     * De-instantiates a polyphonic voice.
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} pitch - the MIDI pitch (0..127)
     * @param {number} velocity - the MIDI velocity (0..127)
     * @memberof IFaustDspNode
     */
    keyOff?(channel: number, pitch: number, velocity: number): void;
    /**
     * Gently terminates all the active voices.
     *
     * @memberof IFaustDspNode
     */
    allNotesOff?(): void;
    /**
     * Handle Raw MIDI Messages
     *
     * @param {number[]} data - MIDI message as array
     * @memberof IFaustDspNode
     */
    midiMessage(data: number[]): void;
    /**
     * Control change
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} ctrl - the MIDI controller number (0..127)
     * @param {number} value - the MIDI controller value (0..127)
     * @memberof IFaustDspNode
     */
    ctrlChange(channel: number, ctrl: number, value: number): void;
    /**
     * PitchWheel
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} value - the MIDI controller value (-1..1)
     * @memberof IFaustDspNode
     */
    pitchWheel(channel: number, wheel: number): void;
}

declare class FaustScriptProcessorNode extends ScriptProcessorNode implements FaustDspNode {
    // From FaustDSPNode interface
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

    outputHandler: (address: string, value: number) => any;
    computeHandler: (bufferSize: number) => any;
    updateOutputs: () => void;

    compute: (e: AudioProcessingEvent) => void;
    parseUI: (ui: TFaustUI) => void;
    parseGroup: (group: TFaustUIGroup) => void;
    parseItems: (items: TFaustUIItem[]) => void;
    parseItem: (ui: TFaustUIItem) => void;

    setParamValue: (path: string, val: number) => void;
    getParamValue: (path: string) => number;

    setup: () => void;

    getPlayingVoice?: (pitch: number) => number;
    allocVoice?: (voice: number) => number;
    getFreeVoice?: () => number;
    keyOn?: (channel: number, pitch: number, velocity: number) => void;
    keyOff?: (channel: number, pitch: number, velocity: number) => void;
    allNotesOff?: () => void;

    midiMessage: (data: number[] | Uint8Array) => void;
    ctrlChange: (channel: number, ctrl: number, value: number) => void;
    pitchWheel: (channel: number, wheel: number) => void;

    /**
     * Return current sample rate.
     *
     * @returns {number} current sample rate
     * @memberof FaustScriptProcessorNode
     */
    getSampleRate: () => number;
    /**
     * Return instance number of audio inputs.
     *
     * @returns {number} instance number of audio inputs
     * @memberof FaustScriptProcessorNode
     */
    getNumInputs: () => number;
    /**
     * Return instance number of audio outputs.
     *
     * @returns {number} instance number of audio outputs
     * @memberof FaustScriptProcessorNode
     */
    getNumOutputs: () => number;
    /**
     * Global init, doing the following initialization:
     * - static tables initialization
     * - call 'instanceInit': constants and instance state initialisation
     *
     * @param {number} sampleRate - the sampling rate in Hertz
     * @memberof FaustScriptProcessorNode
     */
    init: (sampleRate: number) => void;
    /**
     * Init instance state.
     *
     * @param {number} sampleRate - the sampling rate in Hertz
     * @memberof FaustScriptProcessorNode
     */
    instanceInit: (sampleRate: number) => void;
    /**
     * Init instance constant state.
     *
     * @param {number} sampleRate - the sampling rate in Hertz
     * @memberof FaustScriptProcessorNode
     */
    instanceConstants: (sampleRate: number) => void;
    /**
     * Init default control parameters values.
     *
     * @memberof FaustScriptProcessorNode
     */
    instanceResetUserInterface: () => void;
    /**
     * Init instance state (delay lines...).
     *
     * @memberof FaustScriptProcessorNode
     */
    instanceClear: () => any;
    /**
     * Trigger the Meta handler with instance specific calls to 'declare' (key, value) metadata.
     *
     * @param {{ declare: (key: string, value: any) => any }} handler
     * @memberof FaustScriptProcessorNode
     */
    metadata: (handler: { declare: (key: string, value: any) => any }) => void;
    /**
     * Setup a control output handler with a function of type (path, value)
     * to be used on each generated output value. This handler will be called
     * each audio cycle at the end of the 'compute' method.
     *
     * @param {(path: string, value: number) => any} handler - a function of type function(path, value)
     * @memberof FaustScriptProcessorNode
     */
    setOutputParamHandler: (handler: (path: string, value: number) => any) => void;
    /**
     * Get the current output handler.
     *
     * @returns {(path: string, value: number) => any} handler - a function of type function(path, value)
     * @memberof FaustScriptProcessorNode
     */
    getOutputParamHandler: () => (path: string, value: number) => any;
    /**
     * Set a compute handler to be called each audio cycle
     * (for instance to synchronize playing a MIDIFile...).
     *
     * @param {(bufferSize: number) => any} handler - a function of type function(buffer_size)
     * @memberof FaustScriptProcessorNode
     */
    setComputeHandler: (handler: (bufferSize: number) => any) => void;
    /**
     * Get the current compute handler.
     *
     * @memberof FaustScriptProcessorNode
     */
    getComputeHandler: () => (bufferSize: number) => any;
    /**
     * Get the table of all input parameters paths.
     *
     * @returns {object} the table of all input parameter paths.
     * @memberof FaustScriptProcessorNode
     */
    getParams: () => string[];
    /**
     * Get DSP JSON description with its UI and metadata
     *
     * @returns {string} DSP JSON description
     * @memberof FaustScriptProcessorNode
     */
    getJSON: () => string;

    plot: number;
    $plot: number;
    plotted: Float32Array[];
    plotHandler: (plotted: Float32Array[]) => any;
    /**
     * Request plot
     *
     * @param {number} count - amount of samples need to be plotted
     * @returns {Promise<Float32Array[]>}
     * @memberof IFaustDspNode
     */
    replot(count: number): Promise<Float32Array[]>;
}
