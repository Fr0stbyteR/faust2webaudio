export interface FaustWebAssemblyMixerExports {
    clearOutput(count: number, channels: number, $outputs: number): void;
    mixVoice(count: number, channels: number, $inputs: number, $outputs: number): number;
}
