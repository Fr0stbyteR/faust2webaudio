declare module "crypto-libraries/sha1" {
    export default class Sha1 {
        static hash(msg: string, options?: { msgFormat?: "string" | "hex-bytes", outFormat?: "hex" | "hex-w" }): string;
        private static f(s: 0 | 1 | 2 | 3, x: number, y: number, z: number): number;
        private static ROTL(x: number, n: number): number
    }
}
