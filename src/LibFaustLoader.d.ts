declare namespace Emscripten {
    type EnvironmentType = "WEB" | "NODE" | "SHELL" | "WORKER";
    interface FileSystemType {} // eslint-disable-line @typescript-eslint/no-empty-interface
    class Module {
        print(str: string): void;
        printErr(str: string): void;
        arguments: string[];
        environment: EnvironmentType;
        preInit: { (): void }[];
        preRun: { (): void }[];
        postRun: { (): void }[];
        preinitializedWebGLContext: WebGLRenderingContext;
        noInitialRun: boolean;
        noExitRuntime: boolean;
        logReadFiles: boolean;
        filePackagePrefixURL: string;
        wasmBinary: ArrayBuffer;

        destroy(object: object): void;
        getPreloadedPackage(remotePackageName: string, remotePackageSize: number): ArrayBuffer;
        instantiateWasm(
            imports: WebAssembly.Imports,
            successCallback: (module: WebAssembly.Module) => void
        ): WebAssembly.Exports;
        locateFile(url: string): string;
        onCustomMessage(event: MessageEvent): void;

        Runtime: any;

        ccall(ident: string, returnType: string | null, argTypes: string[], args: any[]): any;
        cwrap(ident: string, returnType: string | null, argTypes: string[]): (...args: any[]) => any;

        setValue(ptr: number, value: any, type: string, noSafe?: boolean): void;
        getValue(ptr: number, type: string, noSafe?: boolean): number;

        ALLOC_NORMAL: number;
        ALLOC_STACK: number;
        ALLOC_STATIC: number;
        ALLOC_DYNAMIC: number;
        ALLOC_NONE: number;

        allocate(slab: any, types: string, allocator: number, ptr: number): number;
        allocate(slab: any, types: string[], allocator: number, ptr: number): number;

        Pointer_stringify(ptr: number, length?: number): string; // eslint-disable-line @typescript-eslint/camelcase
        UTF16ToString(ptr: number): string;
        stringToUTF16(str: string, outPtr: number): void;
        UTF32ToString(ptr: number): string;
        stringToUTF32(str: string, outPtr: number): void;

        // USE_TYPED_ARRAYS == 1
        HEAP: Int32Array;
        IHEAP: Int32Array;
        FHEAP: Float64Array;

        // USE_TYPED_ARRAYS == 2
        HEAP8: Int8Array;
        HEAP16: Int16Array;
        HEAP32: Int32Array;
        HEAPU8: Uint8Array;
        HEAPU16: Uint16Array;
        HEAPU32: Uint32Array;
        HEAPF32: Float32Array;
        HEAPF64: Float64Array;

        TOTAL_STACK: number;
        TOTAL_MEMORY: number;
        FAST_MEMORY: number;

        addOnPreRun(cb: () => any): void;
        addOnInit(cb: () => any): void;
        addOnPreMain(cb: () => any): void;
        addOnExit(cb: () => any): void;
        addOnPostRun(cb: () => any): void;

        // Tools
        intArrayFromString(stringy: string, dontAddNull?: boolean, length?: number): number[];
        intArrayToString(array: number[]): string;
        writeStringToMemory(str: string, buffer: number, dontAddNull: boolean): void;
        writeArrayToMemory(array: number[], buffer: number): void;
        writeAsciiToMemory(str: string, buffer: number, dontAddNull: boolean): void;

        addRunDependency(id: any): void;
        removeRunDependency(id: any): void;


        preloadedImages: any;
        preloadedAudios: any;

        _malloc(size: number): number;
        _free(ptr: number): void;
    }
    interface Lookup {
        path: string;
        node: FSNode;
    }
    interface FSStream {} // eslint-disable-line @typescript-eslint/no-empty-interface
    interface FSNode {} // eslint-disable-line @typescript-eslint/no-empty-interface
    interface ErrnoError {} // eslint-disable-line @typescript-eslint/no-empty-interface
    interface FS {
        ignorePermissions: boolean;
        trackingDelegate: any;
        tracking: any;
        genericErrors: any;
        // Path
        lookupPath(path: string, opts: any): Lookup;
        getPath(node: FSNode): string;
        // Nodes
        isFile(mode: number): boolean;
        isDir(mode: number): boolean;
        isLink(mode: number): boolean;
        isChrdev(mode: number): boolean;
        isBlkdev(mode: number): boolean;
        isFIFO(mode: number): boolean;
        isSocket(mode: number): boolean;
        // Devices
        major(dev: number): number;
        minor(dev: number): number;
        makedev(ma: number, mi: number): number;
        registerDevice(dev: number, ops: any): void;
        // Core
        syncfs(populate: boolean, callback: (e: any) => any): void;
        syncfs(callback: (e: any) => any, populate?: boolean): void;
        mount(type: Emscripten.FileSystemType, opts: any, mountpoint: string): any;
        unmount(mountpoint: string): void;

        mkdir(path: string, mode?: number): any;
        mkdev(path: string, mode?: number, dev?: number): any;
        symlink(oldpath: string, newpath: string): any;
        rename(oldpath: string, newpath: string): void;
        rmdir(path: string): void;
        readdir(path: string): any;
        unlink(path: string): void;
        readlink(path: string): string;
        stat(path: string, dontFollow?: boolean): any;
        lstat(path: string): any;
        chmod(path: string, mode: number, dontFollow?: boolean): void;
        lchmod(path: string, mode: number): void;
        fchmod(fd: number, mode: number): void;
        chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;
        lchown(path: string, uid: number, gid: number): void;
        fchown(fd: number, uid: number, gid: number): void;
        truncate(path: string, len: number): void;
        ftruncate(fd: number, len: number): void;
        utime(path: string, atime: number, mtime: number): void;
        open(path: string, flags: string, mode?: number, fdstart?: number, fdend?: number): FSStream;
        close(stream: FSStream): void;
        llseek(stream: FSStream, offset: number, whence: number): any;
        read(stream: FSStream, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;
        write(stream: FSStream, buffer: ArrayBufferView, offset: number, length: number, position?: number, canOwn?: boolean): number;
        allocate(stream: FSStream, offset: number, length: number): void;
        mmap(stream: FSStream, buffer: ArrayBufferView, offset: number, length: number, position: number, prot: number, flags: number): any;
        ioctl(stream: FSStream, cmd: any, arg: any): any;
        readFile(path: string, opts?: {encoding?: string; flags?: string}): any;
        writeFile(path: string, data: ArrayBufferView, opts?: {encoding?: string; flags?: string}): void;
        writeFile(path: string, data: string, opts?: {encoding?: string; flags?: string}): void;
        // module-level FS code
        cwd(): string;
        chdir(path: string): void;
        init(input: () => number, output: (c: number) => any, error: (c: number) => any): void;

        createLazyFile(parent: string, name: string, url: string, canRead: boolean, canWrite: boolean): FSNode;
        createLazyFile(parent: FSNode, name: string, url: string, canRead: boolean, canWrite: boolean): FSNode;

        createPreloadedFile(parent: string, name: string, url: string, canRead: boolean, canWrite: boolean, onload?: () => void, onerror?: () => void, dontCreateFile?: boolean, canOwn?: boolean): void;
        createPreloadedFile(parent: FSNode, name: string, url: string, canRead: boolean, canWrite: boolean, onload?: () => void, onerror?: () => void, dontCreateFile?: boolean, canOwn?: boolean): void;
    }
}
export class LibFaust extends Emscripten.Module {
    UTF8ToString(ptr: number, maxBytesToRead?: number): string;
    UTF8ArrayToString(u8Array: number[], ptr: number, maxBytesToRead?: number): string;
    stringToUTF8Array(str: string, outU8Array: number[], outIdx: number, maxBytesToWrite: number): number;
    stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): number;
    allocateUTF8(str: string): number;
    lengthBytesUTF8?: (str: string) => number;
    FS: Emscripten.FS;

    // Undocumented Promise-like, has issue in https://github.com/emscripten-core/emscripten/issues/5820
    then(func: (module: any) => any): LibFaust | any;
}
declare function FaustModule(FaustModule: LibFaust | { [key: string]: any }, ...args: any[]): LibFaust;
export class LibFaustLoader {
    static load(url?: string): Promise<LibFaust>;
}
