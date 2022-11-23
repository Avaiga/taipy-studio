//@ts-check
'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
// @ts-ignore
const config = (env, argv) => ({

  entry: {"taipy-webviews": "./src/index.tsx"}, // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: { // https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, '../dist/webviews'),
    filename: '[name].js',
    libraryTarget: 'umd',
  },
  devtool: argv.mode === "development" && 'inline-source-map',
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
    ]
  }
});
module.exports = config;
