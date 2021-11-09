const path = require('path');

/** @type {import('webpack').Configuration} */
const config = {
  entry: './src/index.ts',
  resolve: {
    fallback: {
      "path": false,
      "fs": false,
      "ws": false,
      "crypto": false
    },
    extensions: ['.ts', '.js']
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: 'Faust2WebAudio',
    libraryTarget: 'umd'
  },
  node: {
  },
  module: {
    rules: [{
        test: /\.(ts|js)x?$/,
        use: {
          loader: "esbuild-loader",
          options: {
            loader: 'ts',
            target: 'es2016'
          }
        },
        exclude: /(node_modules|libfaust-wasm.js)/,
      },
      {
        test: /\.wasm$/,
        loader: 'url-loader',
        type: 'javascript/auto',
        exclude: /node_modules/,
        options: {
          mimetype: 'application/wasm'
        }
      },
      {
        test: /\.data$/,
        loader: 'url-loader',
        exclude: /node_modules/,
      }
    ]
  }
};
module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.devtool = 'source-map';
    config.output.filename = 'index.js';
  }
  if (argv.mode === 'production') {
    config.devtool = 'source-map';
    config.output.filename = 'index.min.js';
  }
  return config;
};