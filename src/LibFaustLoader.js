import * as LibFaust from "./libfaust-wasm";

class LibFaustLoader {
    static async load(wasmLocation, dataLocation) {
        const locateFile = (path, dir) => ({
            "libfaust-wasm.wasm": wasmLocation,
            "libfaust-wasm.data": dataLocation
        }[path]) || dir + path;
        const libFaust = await LibFaust({ locateFile });
        return libFaust;
    }
}
export { LibFaust, LibFaustLoader };
