/* eslint-disable object-curly-newline */
/* eslint-disable object-property-newline */
import { TDspMeta, TCompiledDsp, TFaustUI, TFaustUIGroup, TFaustUIItem } from "./types";

export class FaustAudioWorkletNode extends (window.AudioWorkletNode ? AudioWorkletNode : null) {
    onprocessorerror = (e: Event) => {
        console.error("Error from " + this.dspMeta.name + " AudioWorkletNode: "); // eslint-disable-line no-console
        throw e;
    }
    /* WAP ??
    getMetadata = this.getJSON;
    setParam = this.setParamValue;
    getParam = this.getParamValue;
    inputChannelCount = this.getNumInputs;
    outputChannelCount = this.getNumOutputs;
    getParams = () => this.inputsItems;
    getDescriptor = this.getParams;
    onMidi = this.midiMessage;
    getState = async () => {
        const params = {} as { [key: string]: string };
        this.getDescriptor().forEach(key => params[key] = JSON.stringify(this.getParam(key)));
        return params;
    }
    setState = async (state: { [key: string]: number; }) => {
        for (const key in state) {
            this.setParam(key, state[key]);
        }
        try {
            this.gui.setAttribute("state", JSON.stringify(state));
        } catch (error) {
            console.warn("Plugin without gui or GUI not defined: ", error);
        }
        return state;
    }
    setPatch = (patch: any) => this.presets ? this.setState(this.presets[patch]) : undefined; // ??
    metadata = (handler: (...args: any[]) => any) => handler(null);
    gui: any;
    presets: any;
    */

    voices?: number;
    dspMeta: TDspMeta;
    effectMeta: TDspMeta;
    outputHandler: (address: string, value: number) => any;
    inputsItems: string[];
    outputsItems: string[];

    plotHandler: (plotted: Float32Array[]) => any;

    constructor(options: { audioCtx: AudioContext; id: string; compiledDsp: TCompiledDsp; voices?: number; plot: number; plotHandler?: (plotted: Float32Array[]) => any; mixer32Module: WebAssembly.Module }) {
        super(options.audioCtx, options.id, {
            numberOfInputs: parseInt(options.compiledDsp.dspMeta.inputs) > 0 ? 1 : 0,
            numberOfOutputs: parseInt(options.compiledDsp.dspMeta.outputs) > 0 ? 1 : 0,
            channelCount: Math.max(1, parseInt(options.compiledDsp.dspMeta.inputs)),
            outputChannelCount: [parseInt(options.compiledDsp.dspMeta.outputs)],
            channelCountMode: "explicit",
            channelInterpretation: "speakers",
            processorOptions: { id: options.id, voices: options.voices, plot: options.plot, compiledDsp: options.compiledDsp, mixer32Module: options.mixer32Module }
        });
        // Patch it with additional functions
        this.port.onmessage = (e: MessageEvent) => {
            if (e.data.type === "param" && this.outputHandler) this.outputHandler(e.data.path, e.data.value);
            else if (e.data.type === "plot" && this.plotHandler) this.plotHandler(e.data.value);
        };
        this.voices = options.voices;
        this.dspMeta = options.compiledDsp.dspMeta;
        this.effectMeta = options.compiledDsp.effectMeta;
        this.outputHandler = null;
        this.inputsItems = [];
        this.outputsItems = [];
        this.plotHandler = options.plotHandler;
        this.parseUI(this.dspMeta.ui);
    }
    parseUI(ui: TFaustUI) {
        ui.forEach(group => this.parseGroup(group));
    }
    parseGroup(group: TFaustUIGroup) {
        if (group.items) this.parseItems(group.items);
    }
    parseItems(items: TFaustUIItem[]) {
        items.forEach(item => this.parseItem(item));
    }
    parseItem(item: TFaustUIItem) {
        if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
            this.parseItems(item.items);
        } else if (item.type === "hbargraph" || item.type === "vbargraph") {
            // Keep bargraph adresses
            this.outputsItems.push(item.address);
        } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
            // Keep inputs adresses
            this.inputsItems.push(item.address);
        }
    }

    /**
     * Instantiates a new polyphonic voice.
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} pitch - the MIDI pitch (0..127)
     * @param {number} velocity - the MIDI velocity (0..127)
     * @memberof FaustAudioWorkletNode
     */
    keyOn(channel: number, pitch: number, velocity: number) {
        this.port.postMessage({ type: "keyOn", data: [channel, pitch, velocity] });
    }
    /**
     * De-instantiates a polyphonic voice.
     *
     * @param {number} channel - the MIDI channel (0..15, not used for now)
     * @param {number} pitch - the MIDI pitch (0..127)
     * @param {number} velocity - the MIDI velocity (0..127)
     * @memberof FaustAudioWorkletNode
     */
    keyOff(channel: number, pitch: number, velocity: number) {
        this.port.postMessage({ type: "keyOff", data: [channel, pitch, velocity] });
    }
    /**
     * Gently terminates all the active voices.
     *
     * @memberof FaustAudioWorkletNode
     */
    allNotesOff() {
        this.port.postMessage({ type: "ctrlChange", data: [0, 123, 0] });
    }
    ctrlChange(channel: number, ctrl: number, value: any) {
        this.port.postMessage({ type: "ctrlChange", data: [channel, ctrl, value] });
    }
    pitchWheel(channel: number, wheel: number) {
        this.port.postMessage({ type: "pitchWheel", data: [channel, wheel] });
    }
    midiMessage(data: number[] | Uint8Array) {
        this.port.postMessage({ data, type: "midi" });
    }
    metadata() {} // eslint-disable-line class-methods-use-this
    setParamValue(path: string, val: number) {
        this.port.postMessage({ type: "param", key: path, value: val });
        this.parameters.get(path).setValueAtTime(val, 0);
    }
    getParamValue(path: string) {
        return this.parameters.get(path).value;
    }
    setOutputParamHandler(handler: (address: string, value: number) => any) {
        this.outputHandler = handler;
    }
    getOutputParamHandler() {
        return this.outputHandler;
    }
    getNumInputs() {
        return parseInt(this.dspMeta.inputs);
    }
    getNumOutputs() {
        return parseInt(this.dspMeta.outputs);
    }
    getParams() {
        return this.inputsItems;
    }
    getJSON() {
        if (this.voices) {
            const o = this.dspMeta;
            const e = this.effectMeta;
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
        return JSON.stringify(this.dspMeta);
    }
    /**
     * Request plot
     *
     * @param {number} count - amount of samples need to be plotted
     * @returns {Promise<Float32Array[]>}
     * @memberof IFaustDspNode
     */
    replot(count: number): Promise<Float32Array[]> {
        return new Promise((resolve: (plotted: Float32Array[]) => any) => {
            this.port.postMessage({ count, type: "replot" });
            this.plotHandler = resolve;
        });
    }
}
