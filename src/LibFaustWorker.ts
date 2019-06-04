import FaustModule from "./libfaust-wasm";
import LibFaustData from "./wasm/libfaust-wasm.data";
import LibFaustWasm from "./wasm/libfaust-wasm.wasm";

declare const self: {
    FaustModule: any;
    LibFaustWasm: string;
    LibFaustData: string;
    _scriptDir: undefined;
    postMessage: (message: any) => void;
};

const wrapper = () => {
    self._scriptDir = undefined;
    const locateFile = (path: string, dir: string) => {
        const map: { [key: string]: string } = {
            "libfaust-wasm.wasm": self.LibFaustWasm,
            "libfaust-wasm.data": self.LibFaustData
        };
        return map[path] || dir + path;
    };
    const init = () => {
        const libFaust = self.FaustModule({ locateFile });
        libFaust.then = (f: (module: any) => any) => { // Workaround of issue https://github.com/emscripten-core/emscripten/issues/5820
            delete libFaust.then;
            // We may already be ready to run code at this time. if
            // so, just queue a call to the callback.
            if (libFaust.calledRun) {
                f(libFaust);
            } else {
                // we are not ready to call then() yet. we must call it
                // at the same time we would call onRuntimeInitialized.
                const _onRuntimeInitialized = libFaust.onRuntimeInitialized;
                libFaust.onRuntimeInitialized = () => {
                    if (_onRuntimeInitialized) _onRuntimeInitialized();
                    f(libFaust);
                };
            }
            return libFaust;
        };
        libFaust.lengthBytesUTF8 = (str: string) => {
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
    };
    addEventListener("message", (e) => {
        const { data: d, source } = e;
        const { data, type, id } = d;
        if (type === "init") {
            self.LibFaustWasm = data.LibFaustWasm;
            self.LibFaustData = data.LibFaustData;
            init().then(() => self.postMessage({ type: "init" }));
        }
    });
};

const strWorker = `
(${wrapper.toString()})();
FaustModule = ${FaustModule.toString()}
`;
const url = window.URL.createObjectURL(new Blob([strWorker], { type: "text/javascript" }));
export const worker = new Worker(url);
worker.postMessage({ type: "init", data: { LibFaustWasm, LibFaustData } });
worker.onmessage = (e) => {
    if (e.data.type === "init") console.log("Faust worker inited");
};
