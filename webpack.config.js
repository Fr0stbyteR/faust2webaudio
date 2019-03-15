const path = require('path');

const config = {
  entry: './src/index.ts',
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    path: path.resolve(__dirname, 'dist')
  },
  node: {
    fs: 'empty'
  },
  module: {
    rules: [{
        test: /\.js$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  }
};
module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.devtool = 'inline-source-map';
    config.output.filename = 'index.js';
  }
  if (argv.mode === 'production') {
    config.output.filename = 'index.min.js';
  }
  return config;
};