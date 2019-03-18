import { TDspMeta } from "./types";
export declare type FaustData = {
    name: string;
    dspMeta: TDspMeta;
    dspBase64Code: string;
    effectMeta?: TDspMeta;
    effectBase64Code?: string;
    mixerBase64Code?: string;
    bufferSize?: number;
    voices?: number;
};
export declare const FaustAudioWorkletProcessorWrapper: () => void;
