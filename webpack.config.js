/*
Copyright (c) 2019, because-why-not.com Limited
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');


//AWRTC bundle for unity / direct java script usage

function build_awrtc_config()
{
  return {
    entry: './src/awrtc/index.ts',
    output: {
      filename: 'awrtc.js',
      path: path.resolve(__dirname, 'build/bundle'),
      library: "awrtc",
      libraryTarget: 'umd'

    },
    mode:"development",
    devtool: "eval-source-map", //unity can't handle separate source maps
    resolve:  {
      extensions: [".ts", ".tsx", ".js", ".json"],
      plugins: [new TsconfigPathsPlugin({ configFile: "./src/awrtc/tsconfig.json"  })]
    },
    module: {
      rules: [
          { 
            test: /\.tsx?$/, 
            loader: "ts-loader"
          },
          {
            enforce: "pre",
            test: /\.js$/,
            loader: "source-map-loader"
          }
      ]
    },
  }
}

configAwrtcDebug = build_awrtc_config();
configAwrtcRelease  = build_awrtc_config();
configAwrtcRelease.mode = "production";
configAwrtcRelease.output.filename = "awrtc.min.js";
configAwrtcRelease.devtool = false;

//jasmine unit test bundle

configTest = 
{
 entry: './src/test/test_entry.ts',
 output: {
   filename: 'test.js',
   path: path.resolve(__dirname, 'build/bundle')
 },
 mode:"development",
 devtool: "source-map",
 resolve: {
   extensions: [".ts", ".tsx", ".js", ".json"],
   plugins: [new TsconfigPathsPlugin({ configFile: "./src/test/tsconfig.json"  })]
 },
 module: {
  rules: [
    { 
      test: /\.tsx?$/, 
      loader: "ts-loader"
    },
    { enforce: "pre", test: /\.js$/, loader: "source-map-loader" }
  ]
 },
};

//bundle of awrtc + several example + test apps

function default_examples_config()
{
  return {
    entry: './src/apps/entry.ts',
    output: {
      filename: 'apps.js',
      path: path.resolve(__dirname, 'build/bundle')

    },
    mode:"development",
    devtool: "source-map",
    resolve:  {
      extensions: [".ts", ".tsx", ".js", ".json"],
      plugins: [new TsconfigPathsPlugin({ configFile: "./src/apps/tsconfig.json"  })]
    },
    module: {
      rules: [
          { 
            test: /\.tsx?$/, 
            loader: "ts-loader"
          },
          {
            enforce: "pre",
            test: /\.js$/,
            loader: "source-map-loader"
          }
      ]
    },
  }
}

examplesConfigDebug = default_examples_config();
examplesConfigRelease = default_examples_config();
examplesConfigRelease.mode = "production";
examplesConfigRelease.output.filename = "apps.min.js";
examplesConfigRelease.devtool = false;

module.exports =
[
  configAwrtcDebug,
  configAwrtcRelease,
  configTest,
  examplesConfigDebug,
  examplesConfigRelease

];