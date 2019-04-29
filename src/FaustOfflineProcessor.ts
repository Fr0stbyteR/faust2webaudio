export default class FaustOfflineProcessor {
    private _sampleRate: number;
    $dsp: number;
    private factory: FaustWebAssemblyExports;
    get sampleRate() {
        return this._sampleRate;
    }
    set sampleRate(sr: number) {
        this.factory.init(this.$dsp, sr);
        this._sampleRate = sr;
    }
}
