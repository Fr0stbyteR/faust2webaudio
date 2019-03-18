import { TFaustUI, TFaustUIGroup, TFaustUIItem, TCompiledDsp, TDspMeta } from "./types";

class FaustAudioWorkletNode extends (window.AudioWorkletNode ? AudioWorkletNode : null) {
    onprocessorerror = (e: Event) => {
        console.error("Error from " + this.dspMeta.name + " AudioWorkletNode: ");
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

    constructor(audioCtx: AudioContext, compiledDsp: TCompiledDsp, voices?: number) {
        super(audioCtx, compiledDsp.codes.dspName, {
            numberOfInputs: parseInt(compiledDsp.dspHelpers.meta.inputs) > 0 ? 1 : 0,
            numberOfOutputs: parseInt(compiledDsp.dspHelpers.meta.outputs) > 0 ? 1 : 0,
            channelCount: Math.max(1, parseInt(compiledDsp.dspHelpers.meta.inputs)),
            outputChannelCount: [parseInt(compiledDsp.dspHelpers.meta.outputs)],
            channelCountMode: "explicit",
            channelInterpretation: "speakers"
        });
        // Patch it with additional functions
        this.port.onmessage = (e: MessageEvent) => {
            if (this.outputHandler) this.outputHandler(e.data.path, e.data.value);
        };
        this.voices = voices;
        this.dspMeta = compiledDsp.dspHelpers.meta;
        if (compiledDsp.effectHelpers) this.effectMeta = compiledDsp.effectHelpers.meta;
        this.outputHandler = null;
        this.inputsItems = [];
        this.outputsItems = [];
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
    midiMessage(data: number[]) {
        this.port.postMessage({ data, type: "midi" });
    }
    metadata() {}
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
}
export { FaustAudioWorkletNode };
