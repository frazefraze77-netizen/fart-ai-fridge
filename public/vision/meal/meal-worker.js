"use strict";

let engine;

async function loadEngine(assets) {
  const pathFor = (path) => {
    const filename = String(path).split("/").pop();
    return assets[filename] ?? path;
  };
  const importLocal = self.importScripts.bind(self);
  const fetchLocal = self.fetch.bind(self);
  self.importScripts = (...urls) => importLocal(...urls.map(pathFor));
  self.fetch = (input, options) => fetchLocal(typeof input === "string" ? pathFor(input) : input, options);
  importLocal(assets["tf.min.js"], assets["tf-tflite.min.js"]);
  await self.tf.setBackend("cpu");
  const features = await self.tflite.getWasmFeatures();
  // Use one thread in this worker, including in browsers with shared memory.
  features.multiThreading = false;
  self.tflite.setWasmPath("https://fart-meal-assets.invalid/");
  return self.tflite.loadTFLiteModel(assets["food-v1.tflite"], { numThreads: 1 });
}

self.addEventListener("message", async ({ data }) => {
  try {
    engine ??= loadEngine(data.assets);
    const model = await engine;
    const input = self.tf.tensor4d(data.pixels, [1, 192, 192, 3], "int32");
    let output;
    try {
      const result = model.predict(input);
      output = typeof result.data === "function" ? result : Object.values(result)[0];
      const scores = Float32Array.from(await output.data(), (value) => value / 256);
      self.postMessage({ id: data.id, scores }, [scores.buffer]);
    } finally {
      input.dispose();
      output?.dispose();
    }
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message || "The meal model could not start." });
  }
});
