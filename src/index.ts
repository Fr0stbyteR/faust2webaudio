import { FaustModule } from "libfaust-wasm";
const faustModule = new FaustModule()
faustModule.lengthBytesUTF8 = (str: string) => {
	let len = 0;
	for(let i = 0; i < str.length; ++i) {
		let u = str.charCodeAt(i);
		if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
		if (u <= 127) ++len;
		else if ( u <= 2047) len += 2;
		else if ( u <= 65535) len += 3;
		else if ( u <= 2097151) len += 4;
		else if ( u <= 67108863) len += 5;
		else len += 6;
	}
	return len;
}
class Faust {
    // Low-level API
    static createWasmCDSPFactoryFromString = faustModule.cwrap('createWasmCDSPFactoryFromString', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
    static deleteAllWasmCDSPFactories = faustModule.cwrap('deleteAllWasmCDSPFactories', null, []);
    static expandCDSPFromString = faustModule.cwrap('expandCDSPFromString', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
    static getCLibFaustVersion = faustModule.cwrap('getCLibFaustVersion', 'number', []);
    static getWasmCModule = faustModule.cwrap('getWasmCModule', 'number', ['number']);
    static getWasmCModuleSize = faustModule.cwrap('getWasmCModuleSize', 'number', ['number']);
    static getWasmCHelpers = faustModule.cwrap('getWasmCHelpers', 'number', ['number']);
    static freeWasmCModule = faustModule.cwrap('freeWasmCModule', null, ['number']);
    static freeCMemory = faustModule.cwrap('freeCMemory', null, ['number']);
    static cleanupAfterException = faustModule.cwrap('cleanupAfterException', null, []);
    static getErrorAfterException = faustModule.cwrap('getErrorAfterException', 'number', []);
    static getLibFaustVersion() {
        return faustModule.UTF8ToString(this.getCLibFaustVersion());
    }
    static ab2str(buf: ArrayBuffer) {
        return buf ? String.fromCharCode.apply(null, new Uint8Array(buf)) : null;
    }
    static str2ab(str: string) {
        if (!str) return null;
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }

    debug = false;
    factory_number = 0;
    factory_table = {} as { [key: string]: any };
    constructor(options: { debug: boolean; }) {
        this.debug = options && options.debug ? true : false;
    }
}