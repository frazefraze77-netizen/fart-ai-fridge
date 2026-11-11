"use strict";

window.FartVision = (() => {
  const scripts = new Map();
  const blobUrls = new Map();
  let readerPromise;
  let detectorPromise;
  let classifierPromise;
  let mealWorker;
  let mealAssets;
  let nextMealId = 0;
  const pendingMeals = new Map();
  let reportProgress = () => {};

  function assetElement(name) {
    return document.getElementById(`asset-${name}`);
  }

  function bytesFromAsset(name) {
    const binary = atob(assetElement(name).textContent.trim());
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function assetURL(name, mime = "text/javascript") {
    if (!assetElement(name)) return new URL(`vision/${name}`, document.baseURI).href;
    if (!blobUrls.has(name)) {
      blobUrls.set(name, URL.createObjectURL(new Blob([bytesFromAsset(name)], { type: mime })));
    }
    return blobUrls.get(name);
  }

  function loadScript(name) {
    if (!scripts.has(name)) {
      scripts.set(name, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = assetURL(name);
        script.onload = resolve;
        script.onerror = () => {
          scripts.delete(name);
          script.remove();
          reject(new Error("The vision engine could not load."));
        };
        document.head.append(script);
      }));
    }
    return scripts.get(name);
  }

  async function createLabelReader() {
    await loadScript("tesseract.min.js");
    const embedded = Boolean(assetElement("eng.traineddata.gz"));
    const core = "tesseract-core-lstm.wasm.js";
    let workerPath = assetURL("worker.min.js");
    if (embedded) {
      // Serve the language model from a local blob through the normal "eng" initialization path.
      const languages = Object.fromEntries(["eng", "deu"].map((lang) =>
        [`${lang}.traineddata.gz`, assetURL(`${lang}.traineddata.gz`, "application/gzip")]));
      const bootstrap = `
        const originalFetch = self.fetch.bind(self);
        const languages = ${JSON.stringify(languages)};
        self.fetch = (input, options) => {
          const filename = typeof input === "string" ? input.split("/").pop() : "";
          return originalFetch(languages[filename] || input, options);
        };
        importScripts(${JSON.stringify(workerPath)});
      `;
      workerPath = URL.createObjectURL(new Blob([bootstrap], { type: "text/javascript" }));
    }
    const reader = await new Promise((resolve, reject) => {
      window.Tesseract.createWorker("eng+deu", 1, {
        corePath: assetURL(core) + (embedded ? "#core.js" : ""),
        workerPath,
        workerBlobURL: false,
        langPath: new URL("vision/", document.baseURI).href,
        cacheMethod: "none",
        errorHandler: (error) => reject(new Error(String(error))),
        logger: ({ status, progress }) => {
          if (status === "recognizing text") reportProgress(`Reading label · ${Math.round(progress * 100)}%`);
        }
      }).then(resolve, reject);
    });
    await reader.setParameters({ tessedit_pageseg_mode: "6" });
    return reader;
  }

  async function readLabel(image, onProgress) {
    reportProgress = onProgress;
    if (!readerPromise) {
      readerPromise = createLabelReader().catch((error) => {
        readerPromise = null;
        throw error;
      });
    }
    const worker = await readerPromise;
    const { data } = await worker.recognize(image);
    return { ...parseLabel(data.text), confidence: data.confidence };
  }

  function parseLabel(text) {
    const field = (pattern) => text.match(pattern)?.[1]?.trim() || "";
    const explicit = field(/^(?:FOOD(?: NAME)?|NAME|PRODUCT|LEBENSMITTEL|PRODUKT)[ \t]*[:=\-][ \t]*(.+)$/im);
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const end = lines.findIndex((line) => /^(ingredients|nutrition|zutaten|nährwert|nahrwert|allergens?)/i.test(line));
    const titleLines = lines.slice(0, end < 0 ? 8 : Math.min(end, 8))
      .filter((line) => !/^(company|brand|made by|hersteller|hergestellt von|marke|mhd|best before|use by)\b/i.test(line));
    const core = window.FartCore;
    const inferred = explicit
      ? core.catalogFor(explicit) ? [] : core.findLabelNames(explicit)
      : (titleLines.map((line) => core.findLabelNames(line, false)).find((names) => names.length)
        ?? titleLines.map((line) => core.findLabelNames(line)).find((names) => names.length) ?? []);
    const company = field(/^(?:COMPANY|BRAND|MADE BY|HERSTELLER|MARKE|HERGESTELLT VON)(?:[ \t]*[:=\-][ \t]*|[ \t]+)(.+)$/im);
    const weight = text.match(/\b(?:NET(?:TO)?(?:[ \t]+(?:WEIGHT|GEWICHT))?|NETTOGEWICHT|FÜLLMENGE|FULLMENGE|WEIGHT|QUANTITY|GEWICHT)[ \t]*[:=\-]?[ \t]*(\d+(?:[.,]\d+)?)[ \t]*(kg|g)\b/im)
      ?? titleLines.map((line) => line.match(/^(\d+(?:[.,]\d+)?)[ \t]*(kg|g)[ \t]*[℮e]?$/i)).find(Boolean);
    const grams = weight ? Number(weight[1].replace(",", ".")) * (weight[2].toLowerCase() === "kg" ? 1000 : 1) : null;
    const deadline = text.match(/\b(USE[ \t-]*BY|EXP(?:IRATION|IRY|IRES)?(?: DATE)?|BEST[ \t-]*BEFORE(?: END)?|MINDESTENS[ \t]+HALTBAR[ \t]+BIS|MHD|ZU[ \t]+VERBRAUCHEN[ \t]+BIS)\b[ \t]*[:=\-]?[ \t\r\n]*([0-9][0-9./ \t-]{5,16})?/im);
    const dateText = deadline?.[2]?.trim() || "";
    const iso = dateText.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/);
    const european = dateText.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})$/);
    const parts = iso ? [iso[1], iso[2], iso[3]]
      : european ? [european[3].length === 2 ? "20" + european[3] : european[3], european[2], european[1]] : [];
    const date = parts.map((part) => part.padStart(2, "0")).join("-");
    return {
      name: explicit || (inferred.length === 1 ? inferred[0] : ""),
      alternatives: inferred,
      explicitName: Boolean(explicit) && !inferred.length,
      company,
      quantity_g: Number.isFinite(grams) && grams >= 1 && grams <= 50000 ? grams : null,
      expiration_date: date >= "1900-01-01" && date <= "2199-12-31" && window.FartCore.validDate(date) ? date : "",
      datePrinted: Boolean(deadline),
      dateKind: /^(BEST|MINDESTENS|MHD)/i.test(deadline?.[1] || "") ? "best-before" : "use-by"
    };
  }

  function embeddedModel(directory = "") {
    return {
      load: async () => {
        const json = JSON.parse(new TextDecoder().decode(bytesFromAsset(directory + "model.json")));
        const shards = json.weightsManifest.flatMap((group) => group.paths).map((path) => bytesFromAsset(directory + path));
        const weightData = new Uint8Array(shards.reduce((size, bytes) => size + bytes.length, 0));
        let offset = 0;
        for (const bytes of shards) {
          weightData.set(bytes, offset);
          offset += bytes.length;
        }
        return {
          modelTopology: json.modelTopology,
          format: json.format,
          generatedBy: json.generatedBy,
          convertedBy: json.convertedBy,
          weightSpecs: json.weightsManifest.flatMap((group) => group.weights),
          weightData: weightData.buffer
        };
      }
    };
  }

  async function createProduceDetector() {
    await loadScript("tf.min.js");
    await loadScript("coco-ssd.min.js");
    await window.tf.ready();
    return window.cocoSsd.load({
      base: "lite_mobilenet_v2",
      modelUrl: assetElement("model.json") ? embeddedModel() : assetURL("model.json", "application/json")
    });
  }

  async function createPhotoClassifier() {
    await loadScript("tf.min.js");
    await window.tf.ready();
    const model = "produce/model.json";
    return window.tf.loadLayersModel(assetElement(model) ? embeddedModel("produce/") : assetURL(model, "application/json"));
  }

  async function classifyPhoto(image) {
    if (!classifierPromise) {
      classifierPromise = createPhotoClassifier().catch((error) => {
        classifierPromise = null;
        throw error;
      });
    }
    const model = await classifierPromise;
    const tf = window.tf;
    const prediction = tf.tidy(() => {
      const pixels = tf.browser.fromPixels(image, 3);
      const input = tf.image.resizeBilinear(pixels, [224, 224], true).toFloat().div(127.5).sub(1).expandDims(0);
      return model.predict(input);
    });
    try {
      const scores = await prediction.data();
      const classes = window.FART_CATALOG.produceClasses;
      if (scores.length !== classes.length) throw new Error("The produce model output is incomplete.");
      const merged = new Map();
      scores.forEach((score, index) => {
        const key = classes[index];
        merged.set(key, (merged.get(key) ?? 0) + score);
      });
      return [...merged].map(([key, score]) => ({ key, score })).sort((a, b) => b.score - a.score);
    } finally {
      prediction.dispose();
    }
  }

  async function detectFamiliarProduce(image) {
    if (!detectorPromise) {
      detectorPromise = createProduceDetector().catch((error) => {
        detectorPromise = null;
        throw error;
      });
    }
    const detector = await detectorPromise;
    const canvas = image.width > 840 || image.height > 840 ? frame(image, image.width, image.height, 840) : image;
    const detections = await detector.detect(canvas, 16, 0.35);
    const supported = window.FART_CATALOG.cocoProduce;
    const best = detections.filter((prediction) => supported.includes(prediction.class)).sort((a, b) => b.score - a.score)[0];
    return best ? { key: best.class, score: best.score, bbox: best.bbox } : null;
  }

  function hasVisibleDetail(image) {
    const preview = frame(image, image.width, image.height, 32);
    const pixels = preview.getContext("2d").getImageData(0, 0, preview.width, preview.height).data;
    let min = 255;
    let max = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
    }
    return max - min >= 14;
  }

  function prepareProduce() {
    if (!detectorPromise) detectorPromise = createProduceDetector().catch(error => { detectorPromise = null; throw error; });
    if (!classifierPromise) classifierPromise = createPhotoClassifier().catch(error => { classifierPromise = null; throw error; });
    return Promise.allSettled([detectorPromise,classifierPromise]);
  }

  // Keep colours intact: correct luminance gently rather than white-balancing
  // away the colour differences between similar fruits and vegetables.
  function produceViews(image, detector) {
    const full = frame(image, image.width, image.height, 640);
    const context = full.getContext("2d");
    const pixels = context.getImageData(0, 0, full.width, full.height);
    const histogram = new Uint32Array(256);
    let dark = 0, bright = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = Math.round(pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114);
      histogram[value] += 1;
      if (value < 20) dark += 1;
      if (value > 242) bright += 1;
    }
    const count = full.width * full.height;
    const percentile = (fraction) => {
      let total = 0;
      for (let i = 0; i < 256; i += 1) {
        total += histogram[i];
        if (total >= count * fraction) return i;
      }
      return 255;
    };
    const low = percentile(0.05), high = percentile(0.95), median = percentile(0.5);
    const problem = dark / count > 0.8 || high < 40 ? "This photo is too dark. Move into soft, even light and try again."
      : bright / count > 0.8 || low > 235 ? "This photo is washed out. Avoid direct light or glare and try again."
      : high - low < 18 ? "The photo has too little visible detail. Focus on one food against a plain background and try again." : "";
    if (problem) return { views: [], problem };

    const crop = document.createElement("canvas");
    let x, y, width, height;
    if (detector?.bbox) {
      // Detector coordinates refer to its at-most-840px input.
      const scale = Math.min(1, 840 / Math.max(image.width, image.height));
      const [bx, by, bw, bh] = detector.bbox.map(value => value / scale);
      const side = Math.max(bw, bh) * 1.25;
      width = height = Math.min(side, image.width, image.height);
      x = Math.max(0, Math.min(image.width - width, bx + bw / 2 - width / 2));
      y = Math.max(0, Math.min(image.height - height, by + bh / 2 - height / 2));
    } else {
      width = height = Math.min(image.width, image.height) * 0.85;
      x = (image.width - width) / 2;
      y = (image.height - height) / 2;
    }
    crop.width = crop.height = 320;
    crop.getContext("2d").drawImage(image, x, y, width, height, 0, 0, 320, 320);
    const corrected = frame(crop, 320, 320, 320);
    const correctedContext = corrected.getContext("2d");
    const correctedPixels = correctedContext.getImageData(0, 0, 320, 320);
    const gamma = Math.max(0.65, Math.min(1.45, Math.log(0.5) / Math.log(Math.max(0.05, Math.min(0.95, median / 255)))));
    for (let i = 0; i < correctedPixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        correctedPixels.data[i + channel] = 255 * Math.pow(correctedPixels.data[i + channel] / 255, gamma);
      }
    }
    correctedContext.putImageData(correctedPixels, 0, 0);
    return { views: [full, crop, corrected], problem: "" };
  }

  function combineProducePredictions(rankings, detector) {
    const scores = new Map();
    for (const ranking of rankings) {
      for (const { key, score } of ranking) {
        scores.set(key, (scores.get(key) || 0) + score / rankings.length);
      }
    }
    const ranked = [...scores].map(([key, score]) => ({ key, score })).sort((a, b) => b.score - a.score);
    const first = ranked[0];
    const votes = first ? rankings.filter(ranking => ranking[0]?.key === first.key).length : 0;
    const stable = rankings.length >= 2 && votes === rankings.length && first.score >= 0.65
      && first.score - (ranked[1]?.score || 0) >= 0.20;
    const reliableDetector = detector?.score >= 0.70;
    const conflict = reliableDetector && first && detector.key !== first.key;
    // A detector must never silently override a conflicting classifier.
    const candidates = reliableDetector ? [detector, ...ranked] : ranked;
    const matches = [];
    for (const match of candidates) {
      if (match.score < 0.12 || !window.FartCore.catalogFor(match.key) || matches.some(item => item.key === match.key)) continue;
      matches.push({ key: match.key, score: match.score });
      if (matches.length === 3) break;
    }
    if (!reliableDetector && (!first || first.score < 0.35)) return { matches: [], uncertain: true };
    return { matches, uncertain: Boolean(conflict) || !(stable || (reliableDetector && detector.score >= 0.85 && first?.key === detector.key)),
      message: conflict ? "The recognition checks disagree. Retake from another angle, or select the food you can verify." : "" };
  }

  async function identifyProduce(image) {
    const initial = produceViews(image, null);
    if (initial.problem) return { matches: [], uncertain: true, message: initial.problem };
    const detector = await detectFamiliarProduce(image).catch(() => null);
    const { views } = detector ? produceViews(image, detector) : initial;
    const rankings = [];
    // Run sequentially to bound GPU memory usage on phones.
    for (const view of views) {
      try { rankings.push(await classifyPhoto(view)); } catch { break; }
    }
    if (!detector && !rankings.length) throw new Error("The food recognition models could not load. Check your connection and try again, or enter the food manually.");
    return combineProducePredictions(rankings, detector);
  }

  function getMealWorker() {
    if (mealWorker) return mealWorker;
    const files = ["tf-tflite.min.js", "food-v1.tflite", "tflite_web_api_cc.js", "tflite_web_api_cc.wasm",
      "tflite_web_api_cc_simd.js", "tflite_web_api_cc_simd.wasm"];
    mealAssets = Object.fromEntries(files.map((name) => [name, assetURL(`meal/${name}`,
      name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".tflite") ? "application/octet-stream" : "text/javascript")]));
    mealAssets["tf.min.js"] = assetURL("tf.min.js");
    const worker = new Worker(assetURL("meal/meal-worker.js"));
    worker.addEventListener("message", ({ data }) => {
      const request = pendingMeals.get(data.id);
      if (!request) return;
      pendingMeals.delete(data.id);
      if (data.error) {
        request.reject(new Error(data.error));
        stopMealWorker();
      } else request.resolve(data.scores);
    });
    worker.addEventListener("error", () => stopMealWorker());
    mealWorker = worker;
    return worker;
  }

  function stopMealWorker() {
    mealWorker?.terminate();
    mealWorker = null;
    for (const request of pendingMeals.values()) request.reject(new Error("The meal model stopped. Try scanning again."));
    pendingMeals.clear();
  }

  async function identifyMeal(image) {
    if (!hasVisibleDetail(image)) return { matches: [], uncertain: true };
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, 192, 192);
    const rgba = context.getImageData(0, 0, 192, 192).data;
    const pixels = new Uint8Array(192 * 192 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      pixels.set(rgba.subarray(i, i + 3), j);
    }
    const worker = getMealWorker();
    const id = ++nextMealId;
    const scores = await new Promise((resolve, reject) => {
      pendingMeals.set(id, { resolve, reject });
      worker.postMessage({ id, assets: mealAssets, pixels }, [pixels.buffer]);
    });
    const labels = window.FART_MEAL_LABELS;
    if (scores.length !== labels.length) throw new Error("The meal model output is incomplete.");
    const ranked = Array.from(scores, (score, index) => ({ name: labels[index], score, index }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0].index === 0 || ranked[0].score < 0.13) return { matches: [], uncertain: true };
    return {
      matches: ranked.filter(({ index, score }) => index > 0 && score >= 0.035).slice(0, 3),
      uncertain: ranked[0].score < 0.55 || ranked[0].score - ranked[1].score < 0.14
    };
  }

  function frame(source, width, height, maxSide = 1700) {
    if (!width || !height) throw new Error("Wait for the camera image to appear.");
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function demoLabel(useBy) {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 575;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#101510";
    context.font = "bold 59px Arial, sans-serif";
    const lines = ["NAME: BANANA", "COMPANY: FART DEMO FARM", "NET WEIGHT: 120 G", `USE BY: ${useBy}`];
    lines.forEach((line, index) => context.fillText(line, 75, 126 + index * 111));
    return canvas;
  }

  return { readLabel, parseLabel, identifyProduce, prepareProduce, identifyMeal, stopMealWorker, frame, demoLabel,
    sampleMealURL: () => assetURL("meal/sample-falafel.jpg", "image/jpeg"),
    sampleProduceURL: (name) => assetURL(`sample-${name}.jpg`, "image/jpeg") };
})();
