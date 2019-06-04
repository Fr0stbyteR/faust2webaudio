import FaustModule from "./libfaust-wasm";
import LibFaustData from "./wasm/libfaust-wasm.data";
import LibFaustWasm from "./wasm/libfaust-wasm.wasm";
import { LibFaust } from "./LibFaustLoader";

declare const self: {
    FaustModule: any;
    libFaust: LibFaust;
    LibFaustWasm: string;
    LibFaustData: string;
    _scriptDir: undefined;
    postMessage: <K extends keyof LibFaustWorkerMessageMap>(message: { id: number; type: K; data: LibFaustWorkerMessageMap[K] }) => void;
    onmessage: <K extends keyof LibFaustWorkerMessageMap>(ev: LibFaustWorkerMessage<K>) => any;
    functions: { [key: string]: (...args: any[]) => any };
};

declare interface LibFaustWorker extends Worker {
    onmessage: <K extends keyof LibFaustWorkerMessageMap>(this: Worker, ev: LibFaustWorkerMessage<K>) => any;
    postMessage<K extends keyof LibFaustWorkerMessageMap>(message: { id: number; type: K; data: LibFaustWorkerMessageMap[K] }, transfer?: Transferable[]): void;
}

declare interface LibFaustWorkerMessage<K extends keyof LibFaustWorkerMessageMap> extends MessageEvent {
    data: { id: number; type: K; data: LibFaustWorkerMessageMap[K] };
}

declare interface LibFaustWorkerMessageMap {
    "init": { LibFaustWasm: string; LibFaustData: string };
    "call": { name: string; args: any[] };
    "inited": undefined;
    "called": number;
    "rejected": string;
}

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
        const libFaust: LibFaust = self.FaustModule({ locateFile });
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
        self.libFaust = libFaust;
        self.functions = {};
        self.functions.createWasmCDSPFactoryFromString = libFaust.cwrap("createWasmCDSPFactoryFromString", "number", ["number", "number", "number", "number", "number", "number"]);
        self.functions.deleteAllWasmCDSPFactories = libFaust.cwrap("deleteAllWasmCDSPFactories", null, []);
        self.functions.expandCDSPFromString = libFaust.cwrap("expandCDSPFromString", "number", ["number", "number", "number", "number", "number", "number"]);
        self.functions.getCLibFaustVersion = libFaust.cwrap("getCLibFaustVersion", "number", []);
        self.functions.getWasmCModule = libFaust.cwrap("getWasmCModule", "number", ["number"]);
        self.functions.getWasmCModuleSize = libFaust.cwrap("getWasmCModuleSize", "number", ["number"]);
        self.functions.getWasmCHelpers = libFaust.cwrap("getWasmCHelpers", "number", ["number"]);
        self.functions.freeWasmCModule = libFaust.cwrap("freeWasmCModule", null, ["number"]);
        self.functions.freeCMemory = libFaust.cwrap("freeCMemory", null, ["number"]);
        self.functions.cleanupAfterException = libFaust.cwrap("cleanupAfterException", null, []);
        self.functions.getErrorAfterException = libFaust.cwrap("getErrorAfterException", "number", []);
        self.functions.getLibFaustVersion = () => libFaust.UTF8ToString(self.functions.getCLibFaustVersion());
        self.functions.generateCAuxFilesFromString = libFaust.cwrap("generateCAuxFilesFromString", "number", ["number", "number", "number", "number", "number"]);
        self.functions.lengthBytesUTF8 = libFaust.lengthBytesUTF8;
        self.functions.UTF8ToString = libFaust.UTF8ToString;
        self.functions.stringToUTF8 = libFaust.stringToUTF8;
        self.functions._malloc = libFaust._malloc;
        self.functions._free = libFaust._free;
        self.functions.HEAP8 = () => libFaust.HEAP8;
        self.functions.HEAP32 = () => libFaust.HEAP32;
        self.functions.readFile = () => libFaust.FS.readFile;
        return libFaust;
    };
    self.onmessage = (e) => {
        const { type, id } = e.data;
        if (type === "init") {
            const data = e.data.data as LibFaustWorkerMessageMap["init"];
            self.LibFaustWasm = data.LibFaustWasm;
            self.LibFaustData = data.LibFaustData;
            init().then(() => self.postMessage({ id, type: "inited", data: undefined }));
        } else if (type === "call") {
            const data = e.data.data as LibFaustWorkerMessageMap["call"];
            try {
                if (typeof self.functions[data.name] === "function") self.postMessage({ id, type: "called", data: self.functions[data.name](...data.args) });
                else throw new Error("No such function in libfaust: " + data.name);
            } catch (error) {
                self.postMessage({ id, type: "rejected", data: error.toString() });
            }
        }
    }
};

export class LibFaustWorkerWrapper {
    worker: LibFaustWorker;
    private inited: boolean;
    initCallback: (...args: any) => any;
    private _messageID: number;
    private resolvers: ((...args: any) => any)[];
    private rejectors: ((...args: any) => any)[];
    constructor() {
        this._messageID = 0;
        this.inited = false;
        this.resolvers = [];
        this.rejectors = [];
        const strWorker = `
(${wrapper.toString()})();
FaustModule = ${FaustModule.toString()}
`;
        const url = window.URL.createObjectURL(new Blob([strWorker], { type: "text/javascript" }));
        this.worker = new Worker(url);
        this.worker.postMessage({ id: this.messageID, type: "init", data: { LibFaustWasm, LibFaustData } });
        this.worker.onmessage = (e) => {
            const { id, type } = e.data;
            if (type === "inited") {
                this.inited = true;
                if (this.initCallback) this.initCallback();
            } else if (type === "called") {
                const data = e.data.data as LibFaustWorkerMessageMap["called"];
                if (this.resolvers[id]) this.resolvers[id](data);
                delete this.resolvers[id];
                delete this.rejectors[id];
            } else if (type === "rejected") {
                const data = e.data.data as LibFaustWorkerMessageMap["rejected"];
                if (this.rejectors[id]) this.rejectors[id](data);
                else throw new Error(data);
                delete this.resolvers[id];
                delete this.rejectors[id];
            }
        };
    }
    get ready() {
        const executor = (resolve: () => void) => {
            this.initCallback = resolve;
            if (this.inited) resolve();
        };
        return new Promise(executor);
    }
    get messageID() {
        return this._messageID++;
    }
    getCallWorkerPromise(name: string, args: any[]) {
        const id = this.messageID;
        const executor = (resolve: (value?: any | PromiseLike<any>) => void, reject: (reason?: any) => void) => {
            this.resolvers[id] = resolve;
            this.rejectors[id] = reject;
            this.worker.postMessage({
                id,
                type: "call",
                data: { name, args }
            });
        };
        return new Promise(executor);
    }
    async createWasmCDSPFactoryFromString($name: number, $code: number, argc: number, $argv: number, $errorMsg: number, internalMemory: boolean): Promise<number> {
        return this.getCallWorkerPromise("createWasmCDSPFactoryFromString", [$name, $code, argc, $argv, $errorMsg, internalMemory]);
    }
    async deleteAllWasmCDSPFactories(): Promise<void> {
        return this.getCallWorkerPromise("deleteAllWasmCDSPFactories", []);
    }
    async expandCDSPFromString($name: number, $code: number, argc: number, $argv: number, $shaKey: number, $errorMsg: number): Promise<number> {
        return this.getCallWorkerPromise("expandCDSPFromString", [$name, $code, argc, $argv, $shaKey, $errorMsg]);
    }
    async getCLibFaustVersion(): Promise<number> {
        return this.getCallWorkerPromise("getCLibFaustVersion", []);
    }
    async getWasmCModule($moduleCode: number): Promise<number> {
        return this.getCallWorkerPromise("getWasmCModule", [$moduleCode]);
    }
    async getWasmCModuleSize($moduleCode: number): Promise<number> {
        return this.getCallWorkerPromise("getWasmCModuleSize", [$moduleCode]);
    }
    async getWasmCHelpers($moduleCode: number): Promise<number> {
        return this.getCallWorkerPromise("getWasmCHelpers", [$moduleCode]);
    }
    async freeWasmCModule($moduleCode: number): Promise<void> {
        return this.getCallWorkerPromise("freeWasmCModule", [$moduleCode]);
    }
    async freeCMemory($: number): Promise<number> {
        return this.getCallWorkerPromise("freeCMemory", [$]);
    }
    async cleanupAfterException(): Promise<void> {
        return this.getCallWorkerPromise("cleanupAfterException", []);
    }
    async getErrorAfterException(): Promise<number> {
        return this.getCallWorkerPromise("getErrorAfterException", []);
    }
    async getLibFaustVersion(): Promise<string> {
        return this.getCallWorkerPromise("getLibFaustVersion", []);
    }
    async generateCAuxFilesFromString($name: number, $code: number, argc: number, $argv: number, $errorMsg: number): Promise<number> {
        return this.getCallWorkerPromise("generateCAuxFilesFromString", [$name, $code, argc, $argv, $errorMsg]);
    }
    async _malloc(size: number): Promise<number> {
        return this.getCallWorkerPromise("_malloc", [size]);
    }
    async _free(ptr: number): Promise<void> {
        return this.getCallWorkerPromise("_free", [ptr]);
    }
    async lengthBytesUTF8(str: string): Promise<number> {
        return this.getCallWorkerPromise("lengthBytesUTF8", [str]);
    }
    async stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): Promise<number> {
        return this.getCallWorkerPromise("stringToUTF8", [str, outPtr, maxBytesToWrite]);
    }
    async UTF8ToString(ptr: number, maxBytesToRead?: number): Promise<string> {
        return this.getCallWorkerPromise("UTF8ToString", [ptr, maxBytesToRead]);
    }
    async readFile(path: string, opts?: { encoding?: string; flags?: string }): Promise<string> {
        return this.getCallWorkerPromise("readFile", [path, opts]);
    }
    get HEAP32(): Promise<Int32Array> {
        return this.getCallWorkerPromise("HEAP32", []);
    }
    get HEAP8(): Promise<Int8Array> {
        return this.getCallWorkerPromise("HEAP8", []);
    }
}
