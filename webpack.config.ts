import path from "node:path";
import webpack from "webpack";
import CopyPlugin from "copy-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";

import "webpack-dev-server";

const config: webpack.Configuration = {
  target: "node",
  devtool: false,
  mode: "production",
  entry: "./tfx2json.ts",
  output: {
    clean: true,
    path: path.resolve(__dirname, "dist"),
    filename: "tfx2json.js",
    library: {
      commonjs: "tfx2json",
      amd: "tfx2json",
      root: "TFX2JSON",
    },
    libraryTarget: "umd",
    umdNamedDefine: true,
    globalObject: `(typeof self !== 'undefined' ? self : this)`,
  },
  externalsPresets: { node: true },
  node: {
    global: false,
    __filename: false,
    __dirname: false,
  },
  optimization: {
    nodeEnv: false,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.[j|t]sx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          transpileOnly: true,
        },
      },
      {
        test: /\.wasm$/,
        loader: "url-loader",
        options: {
          mimetype: "delete/me",
          limit: 15 * 1024 * 1024,
          // this removes the "data:<whatever>;base64," from the output bundle
          generator: (content: Buffer) => content.toString("base64"),
        },
      },
    ],
  },
  performance: {
    hints: false,
  },
  plugins: [
    new webpack.ProgressPlugin(),
    new CopyPlugin({
      patterns: [
        { from: "README.md", to: "." },
        { from: "types.d.ts", to: "." },
        { from: "exports.d.ts", to: "." },
        {
          from: "package.json",
          to: ".",
          transform: (content) => {
            const json = JSON.parse(content.toString());
            json.devDependencies = undefined;
            json.scripts = undefined;
            json.main = "./tfx2json.js";
            return JSON.stringify(json, null, 2);
          },
        },
      ],
    }),
  ],
};

export default config;
