/// <reference types="webassembly-js-api" />
import "./types";
import { FaustWebAssemblyExports } from "./FaustWebAssemblyExports";
import { TDspMeta, TFaustUI, TFaustUIGroup, TFaustUIItem } from "./types";
import { FaustWebAssemblyMixerExports } from "./FaustWebAssemblyMixerExports";
export interface FaustScriptProcessorNode extends ScriptProcessorNode {
    dspMeta: TDspMeta;
    effectMeta?: TDspMeta;
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
    pathTable$: { [address: string]: number }
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

    getPlayingVoice?: (pitch: number) => number;
    allocVoice?: (voice: number) => number;
    getFreeVoice?: () => number;

    outputHandler: (address: string, value: number) => any;
    computeHandler: (bufferSize: number) => any;
    updateOutputs: () => void;
    compute: (e: AudioProcessingEvent) => void;
    parseUI: (ui: TFaustUI) => void;
    parseGroup: (group: TFaustUIGroup) => void;
    parseItems: (items: TFaustUIItem[]) => void;
    parseItem: (ui: TFaustUIItem) => void;
    /**
     * Setup WebAudio ScriptProcessor callbacks
     *
     * @memberof FaustScriptProcessorNode
     */
    setup: () => void;
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
     * Instantiates a new polyphonic voice.
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} pitch - the MIDI pitch (0..127)
     * @param {number} velocity - the MIDI velocity (0..127)
     * @memberof FaustScriptProcessorNode
     */
    keyOn: (channel: number, pitch: number, velocity: number) => void;
    /**
     * De-instantiates a polyphonic voice.
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} pitch - the MIDI pitch (0..127)
     * @param {number} velocity - the MIDI velocity (0..127)
     * @memberof FaustScriptProcessorNode
     */
    keyOff: (channel: number, pitch: number, velocity: number) => void;
    /**
     * Gently terminates all the active voices.
     *
     * @memberof FaustScriptProcessorNode
     */
    allNotesOff: () => void;
    /**
     * Control change
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} ctrl - the MIDI controller number (0..127)
     * @param {number} value - the MIDI controller value (0..127)
     * @memberof FaustScriptProcessorNode
     */
    ctrlChange: (channel: number, ctrl: number, value: number) => void;
    /**
     * PitchWheel
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} value - the MIDI controller value (-1..1)
     * @memberof FaustScriptProcessorNode
     */
    pitchWheel: (channel: number, wheel: number) => void;
    /**
     * Set control value.
     *
     * @param {string} path - the path to the wanted control (retrieved using 'getParams' method)
     * @param {number} val - the float value for the wanted parameter
     * @memberof FaustScriptProcessorNode
     */
    setParamValue: (path: string, val: number) => void;
    /**
     * Get control value.
     *
     * @param {string} path - the path to the wanted control (retrieved using 'controls' method)
     *
     * @returns {number} the float value
     * @memberof FaustScriptProcessorNode
     */
    getParamValue: (path: string) => number;
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