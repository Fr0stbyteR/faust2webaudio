/// <reference types="webassembly-js-api" />
import { FaustWebAssemblyExports } from "./FaustWebAssemblyExports";
import { TDspMeta, TFaustUI, TFaustUIGroup, TFaustUIItem } from "./types";
import { FaustWebAssemblyMixerExports } from "./FaustWebAssemblyMixerExports";
import { IFaustDspNode } from "./IFaustDspNode";
export class FaustScriptProcessorNode extends ScriptProcessorNode implements IFaustDspNode {
    // From FaustDSPNode interface
    bufferSize: number;
    voices: number;
    dspMeta: TDspMeta;
    $ins: number;
    $outs: number;
    dspInChannnels: Float32Array[];
    dspOutChannnels: Float32Array[];
    fPitchwheelLabel: string[];
    fCtrlLabel: { path: string, min: number, max: number }[][];
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
}