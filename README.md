# Faust2WebAudio

## Testing

Clone a copy of the repo:

```bash
git clone https://github.com/Fr0stbyteR/faust2webaudio.git
```
Put the directory in a local server, then open `./test/index.html`

## Installing as npm package

```bash
npm install -D Fr0stbyteR/faust2webaudio
```

Example: 

```JavaScript
import { Faust } from "faust2webaudio";
const audioCtx = new AudioContext();
const code = `
import("stdfaust.lib");
process = ba.pulsen(1, 10000) : pm.djembe(60, 0.3, 0.4, 1) <: dm.freeverb_demo;`;
const polycode = `
import("stdfaust.lib");
process = ba.pulsen(1, 10000) : pm.djembe(ba.hz2midikey(freq), 0.3, 0.4, 1) * gate * gain with {
    freq = hslider("freq", 440, 40, 8000, 1);
    gain = hslider("gain", 0.5, 0, 1, 0.01);
    gate = button("gate");
};
effect = dm.freeverb_demo;`;
new Faust().ready.then((faust) => {
    faust.getNode(polycode, { audioCtx, useWorklet: window.AudioWorklet ? true : false, voices: 4, args: { "-I": "https://faust.grame.fr/tools/editor/libraries/" } })
    .then(node => node.connect(audioCtx.destination));
    faust.getNode(code, { audioCtx, useWorklet: window.AudioWorklet ? true : false, args: { "-I": "https://faust.grame.fr/tools/editor/libraries/" } })
    .then(node => node.connect(audioCtx.destination));
});
```

## Building

Firstly ensure that you have [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/) installed.

Clone a copy of the repo then change to the directory:

```bash
git clone https://github.com/Fr0stbyteR/faust2webaudio.git
cd faust2webaudio
```
Install dev dependencies:

```bash
npm install
```

To upgrade Libfaust version: replace `src/libfaust-wasm.js` and `src/wasm/libfaust-wasm.wasm`

To build everything (using Webpack 4, Babel 7, TypeScript), this will produce `dist/index.js` and `dist/index.min.js`
```bash
npm run dist
```

If you don't want to build ths minified js for testing purpose:
```bash
npm run build
```
To test, put the directory in a local server, then open `./test/index.html`
