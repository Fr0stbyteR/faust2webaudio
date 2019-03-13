import { TDspMeta, TFaustUI, TFaustUIGroup, TFaustUIItem } from "./types";
import { FaustWebAssemblyExports } from "./FaustWebAssemblyExports";
import { FaustWebAssemblyMixerExports } from "./FaustWebAssemblyMixerExports";

declare interface IFaustDspNode {
    bufferSize: number;
    voices?: number;
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