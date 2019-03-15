import { TFaustUI, TFaustUIGroup, TFaustUIItem, TCompiledDsp, TDspMeta } from "./types";
declare interface AudioParamMap extends ReadonlyMap<string, AudioParam> {
}
declare const FaustAudioWorkletNode_base: {
    new (context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions): AudioWorkletNode;
    prototype: AudioWorkletNode;
};
declare class FaustAudioWorkletNode extends FaustAudioWorkletNode_base {
    onprocessorerror: (e: Event) => never;
    parameters: AudioParamMap;
    voices?: number;
    dspMeta: TDspMeta;
    effectMeta: TDspMeta;
    outputHandler: (address: string, value: number) => any;
    inputsItems: string[];
    outputsItems: string[];
    constructor(audioCtx: AudioContext, compiledDsp: TCompiledDsp, voices?: number);
    parseUI(ui: TFaustUI): void;
    parseGroup(group: TFaustUIGroup): void;
    parseItems(items: TFaustUIItem[]): void;
    parseItem(item: TFaustUIItem): void;
    keyOn(channel: number, pitch: number, velocity: number): void;
    keyOff(channel: number, pitch: number, velocity: number): void;
    allNotesOff(): void;
    ctrlChange(channel: number, ctrl: number, value: any): void;
    pitchWheel(channel: number, wheel: number): void;
    midiMessage(data: number[]): void;
    metadata(): void;
    setParamValue(path: string, val: number): void;
    getParamValue(path: string): number;
    setOutputParamHandler(handler: (address: string, value: number) => any): void;
    getOutputParamHandler(): (address: string, value: number) => any;
    getNumInputs(): number;
    getNumOutputs(): number;
    getParams(): string[];
    getJSON(): string;
}
export { FaustAudioWorkletNode };
