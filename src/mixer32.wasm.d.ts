declare module "mixer32.wasm" {
    export function clearOutput(count: number, channels: number, outputs: number): void;
    export function mixVoice(count: number, channels: number, outputs: number): number;
}
