import * as LibFaust from "./libfaust-wasm";

class LibFaustLoader {
    static async load(wasmLocation, dataLocation) {
        const locateFile = (path, dir) => ({
            "libfaust-wasm.wasm": wasmLocation,
            "libfaust-wasm.data": dataLocation
        }[path]) || dir + path;
        const libFaust = await LibFaust({ locateFile });
        libFaust.lengthBytesUTF8 = (str) => {
            let len = 0;
            for (let i = 0; i < str.length; ++i) {
                let u = str.charCodeAt(i);
                // eslint-disable-next-line no-mixed-operators
                if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
                if (u <= 127) ++len;
                else if (u <= 2047) len += 2;
                else if (u <= 65535) len += 3;
                else if (u <= 2097151) len += 4;
                else if (u <= 67108863) len += 5;
                else len += 6;
            }
            return len;
        };
        return libFaust;
    }
}
export { LibFaust, LibFaustLoader };
