export declare class AudioWorkletProcessor {
    public port: MessagePort;
    constructor(options: AudioWorkletNodeOptions);
    public process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any): boolean;
    static parameterDescriptors: AudioParamDescriptor[];
}
export type AudioWorkletProcessorConstructor<T extends AudioWorkletProcessor> = {
    new (options: AudioWorkletNodeOptions): T;
};
export declare function registerProcessor<T extends AudioWorkletProcessor>(name: string, constructor: AudioWorkletProcessorConstructor<T>): void;
export declare const currentFrame: number;
export declare const currentTime: number;
export declare const sampleRate: number;
export interface AudioParamDescriptor {
    defaultValue?: number;
    maxValue?: number;
    minValue?: number;
    name: string;
}
