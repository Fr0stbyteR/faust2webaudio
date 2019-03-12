import { TFaustUI, TFaustUIGroup, TFaustUIItem, TCompiledDsp, TDspMeta } from "./types";

declare interface AudioParamMap extends ReadonlyMap<string, AudioParam> {}

const remap = (v: number, mn0: number, mx0: number, mn1: number, mx1: number) => (v - mn0) / (mx0 - mn0) * (mx1 - mn1) + mn1;

export class FaustAudioWorkletNode extends AudioWorkletNode {
    onprocessorerror = (e: Event) => {
        console.error("Error from " + name + " AudioWorkletNode: " + e);
    };
    parseUI = (ui: TFaustUI) => ui.forEach(group => this.parseGroup(group));
    parseGroup = (group: TFaustUIGroup) => group.items ? this.parseItems(group.items) : null;
    parseItems = (items: TFaustUIItem[]) => items.forEach(item => this.parseItem(item));
    parseItem = (item: TFaustUIItem) => {
        if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") {
            this.parseItems(item.items);
        } else if (item.type === "hbargraph" || item.type === "vbargraph") {
            // Keep bargraph adresses
            this.outputsItems.push(item.address);
            this.pathTable$[item.address] = parseInt(item.index);
        } else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
            // Keep inputs adresses
            this.inputsItems.push(item.address);
            this.pathTable$[item.address] = parseInt(item.index);
            if (!item.meta) return;
            item.meta.forEach((meta) => {
                const midi = meta.midi;
                if (!midi) return;
                const strMidi = midi.trim();
                if (strMidi === "pitchwheel") {
                    this.fPitchwheelLabel.push(item.address);
                } else {
                    const matched = strMidi.match(/^ctrl\s(\d+)/);
                    if (!matched) return;
                    this.fCtrlLabel[parseInt(matched[1])].push({
                        path: item.address,
                        min: parseFloat(item.min),
                        max: parseFloat(item.max)
                    });
                }
            });
        }
    };
    init = () => {
        this.outputHandler = null;
        this.inputsItems = [];
        this.outputsItems = [];
        this.fPitchwheelLabel = [];
        // tslint:disable-next-line: prefer-array-literal
        this.fCtrlLabel = new Array(128).fill(null).map(() => []);
        this.parseUI(this.dspMeta.ui);
    }
    getJSON = () => JSON.stringify(this.dspMeta);
    getMetadata = this.getJSON;
    setParamValue = (path: string, val: number) => this.parameters.get(path).setValueAtTime(val, 0);
    getParamValue = (path: string) => this.parameters.get(path).value;
    setParam = this.setParamValue;
    getParam = this.getParamValue;
    setOutputParamHandler = (handler: (address: string, value: number) => any) => this.outputHandler = handler;
    getOutputParamHandler = () => this.outputHandler;
    getNumInputs = () => parseInt(this.dspMeta.inputs);
    getNumOutputs = () => parseInt(this.dspMeta.outputs);
    inputChannelCount = this.getNumInputs;
    outputChannelCount = this.getNumOutputs;
    getParams = () => this.inputsItems;
    getDescriptor = this.getParams;
    ctrlChange = (channel: number, ctrl: number, value: any) => {
        if (!this.fCtrlLabel[ctrl].length) return;
        this.fCtrlLabel[ctrl].forEach((ctrl) => {
            const path = ctrl.path;
            this.setParamValue(path, remap(value, 0, 127, ctrl.min, ctrl.max));
            if (this.outputHandler) this.outputHandler(path, this.getParamValue(path));
        });
    };
    pitchWheel = (channel: number, wheel: number) => {
        this.fPitchwheelLabel.forEach((path) => {
            this.setParamValue(path, Math.pow(2, wheel / 12));
            if (this.outputHandler) this.outputHandler(path, this.getParamValue(path));
        });
    };
    midiMessage = (data: number[]) => {
        const cmd = data[0] >> 4;
        const channel = data[0] & 0xf;
        const data1 = data[1];
        const data2 = data[2];
        if (channel === 9) return;
        if (cmd === 11) return this.ctrlChange(channel, data1, data2);
        if (cmd === 14) return this.pitchWheel(channel, (data2 * 128.0 + data1 - 8192) / 8192);
    };
    onMidi = this.midiMessage;
    /* WAP ??
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

    parameters: AudioParamMap;
    dspMeta: TDspMeta;
    pathTable$: { [address: string]: number };
    outputHandler: (address: string, value: number) => any;
    inputsItems: string[];
    outputsItems: string[];
    fPitchwheelLabel: string[];
    fCtrlLabel: { path: string, min: number, max: number }[][];

    constructor(audioCtx: AudioContext, compiledDsp: TCompiledDsp) {
        super(audioCtx, compiledDsp.codes.dspName, {
            numberOfInputs: (parseInt(compiledDsp.dspHelpers.meta.inputs) > 0) ? 1 : 0,
            numberOfOutputs: (parseInt(compiledDsp.dspHelpers.meta.outputs) > 0) ? 1 : 0,
            channelCount: Math.max(1, parseInt(compiledDsp.dspHelpers.meta.inputs)),
            outputChannelCount: [parseInt(compiledDsp.dspHelpers.meta.outputs)],
            channelCountMode: "explicit",
            channelInterpretation: "speakers"
        });
        // Patch it with additional functions
        this.port.onmessage = (e: MessageEvent) => {
            if (this.outputHandler) this.outputHandler(e.data.path, e.data.value);
        };

        this.dspMeta = compiledDsp.dspHelpers.meta;
        this.init();
    }
}
