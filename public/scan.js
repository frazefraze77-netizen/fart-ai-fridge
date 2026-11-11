"use strict";

const Vision = window.FartVision;
const scanDialog = byId("scan-dialog");
const camera = byId("camera");
const scanPhoto = byId("scan-photo");
const scanMode = byId("scan-mode");
const scanAction = byId("scan-action");
const sampleButton = byId("sample-scan");
const photoInput = byId("photo-input");
const scanStatus = byId("scan-status");
const cameraButtons = ["start-camera", "capture-camera", "stop-camera"].map(byId);
const scanChoices = byId("scan-choices");
const photoSample = byId("produce-sample");
const cameraFoods = [...new Set([...Catalog.produceClasses, ...Catalog.cocoProduce])]
  .map((key) => Core.CATALOG[key].name).sort((a, b) => a.localeCompare(b));
let choices = [];
let partialLabel = null;
const mealLabelCount = window.FART_MEAL_LABELS.length - 1;
let stream = null;
let cameraRequest = 0;
let scanBusy = false;
let scanVersion = 0;
let autoCaptureTimer = null;
const autoCapture = byId("auto-capture");

function cancelAutoCapture() { clearInterval(autoCaptureTimer); autoCaptureTimer = null; }

function scheduleAutoCapture() {
  cancelAutoCapture();
  if (!autoCapture.checked || !stream || scanBusy || !scanDialog.open) return;
  let remaining = 4;
  scanStatus.textContent = `Hold the food in the centre. Automatically scanning in ${remaining} seconds…`;
  autoCaptureTimer = setInterval(() => {
    if (!stream || scanBusy || !scanDialog.open) { cancelAutoCapture(); return; }
    remaining -= 1;
    if (remaining > 0) { scanStatus.textContent = `Hold steady. Scanning in ${remaining} seconds…`; return; }
    cancelAutoCapture();
    try { void scanFrame(Vision.frame(camera,camera.videoWidth,camera.videoHeight)); }
    catch (error) { scanStatus.textContent = error.message; }
  },1000);
}

function displayScanImage(source, message) {
  scanPhoto.src = source;
  scanPhoto.hidden = false;
  camera.hidden = true;
  byId("scan-placeholder").hidden = true;
  scanStatus.textContent = message;
}

function stopCamera() {
  cancelAutoCapture();
  cameraRequest += 1;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  camera.srcObject = null;
  camera.hidden = true;
  cameraButtons[0].hidden = false;
  cameraButtons[1].hidden = true;
  cameraButtons[2].hidden = true;
  byId("scan-placeholder").hidden = !scanPhoto.hidden;
}

function openScanner() {
  scanVersion += 1;
  scanBusy = false;
  scanMode.value = "produce";
  scanAction.value = "add";
  scanPhoto.hidden = true;
  scanPhoto.removeAttribute("src");
  byId("scan-placeholder").hidden = false;
  sampleButton.textContent = "Try banana photo";
  byId("produce-demo").hidden = false;
  photoSample.value = "banana";
  clearChoices();
  scanStatus.textContent = "Ready for fruit and vegetables. Start the camera or choose a photo; confirm the result before adding.";
  setScanControls(false);
  scanDialog.showModal();
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    scanStatus.textContent = "Camera access needs a supported browser. Choose a photo or use the sample.";
    return;
  }
  clearChoices();
  if (scanMode.value === "produce") void Vision.prepareProduce();
  const request = ++cameraRequest;
  cameraButtons[0].disabled = true;
  try {
    const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (request !== cameraRequest || !scanDialog.open) {
      next.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = next;
    camera.srcObject = stream;
    await camera.play();
    if (request !== cameraRequest || !scanDialog.open) return;
    scanPhoto.hidden = true;
    camera.hidden = false;
    byId("scan-placeholder").hidden = true;
    cameraButtons[0].hidden = true;
    cameraButtons[1].hidden = false;
    cameraButtons[2].hidden = false;
    scanStatus.textContent = "Fill the centre with one food. Use soft, even light, avoid glare and hold steady, then select Scan now.";
    scheduleAutoCapture();
  } catch (error) {
    if (request === cameraRequest) {
      stopCamera();
      scanStatus.textContent = error.name === "NotAllowedError" ? "Camera access is blocked. Allow the camera in your browser’s site settings, or choose a photo." : error.name === "NotFoundError" ? "No camera was found. Connect a webcam, or choose a photo." : error.name === "NotReadableError" ? "Another app may be using the camera. Close it and try again, or choose a photo." : "The camera could not start. Try again or choose a photo.";
    }
  } finally {
    if (request === cameraRequest || !stream) cameraButtons[0].disabled = scanBusy;
  }
}

function setScanControls(busy) {
  scanBusy = busy;
  for (const control of [scanMode, scanAction, sampleButton, photoInput, photoSample, autoCapture, ...cameraButtons]) control.disabled = busy;
}

function waitForImage(source) {
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = source;
  });
}

function demoUseBy() {
  if (scanAction.value === "take") {
    const existing = state.foods.find((food) => Core.keyFor(food.name) === "banana"
      && food.company.toLowerCase() === "fart demo farm" && food.date_source === "label");
    if (existing) return existing.expiration_date;
  }
  return Core.addDays(state.date, 2);
}

function scanTakeOut(fields) {
  const key = Core.keyFor(fields.name);
  let matches = state.foods.filter((food) => Core.keyFor(food.name) === key
    || (fields.input_source === "Meal photo" && Core.keyFor(food.photo_label) === key));
  if (fields.company && fields.input_source !== "Meal photo") matches = matches.filter((food) => food.company.toLowerCase() === fields.company.toLowerCase());
  if (Core.validDate(fields.expiration_date)) matches = matches.filter((food) => food.expiration_date === fields.expiration_date);
  if (matches.length > 1 && Number.isFinite(fields.quantity_g)) {
    matches = matches.filter((food) => food.quantity_g === fields.quantity_g);
  }
  if (matches.length !== 1) {
    scanStatus.textContent = matches.length
      ? "Several inventory items match. Select the right item in My fridge."
      : "There’s no matching item in the fridge. Check the label or choose the item in My fridge.";
    return;
  }
  const item = matches[0];
  if (Core.deadline(item, state.date) < 0) {
    scanStatus.textContent = "This item’s date has passed. You can review it in My fridge.";
    return;
  }
  scanDialog.close();
  takeFood(item.id);
}

function clearChoices() {
  choices = [];
  partialLabel = null;
  scanChoices.replaceChildren();
  byId("scan-options").hidden = true;
}

function showChoices(matches, message, partial = null) {
  choices = matches;
  partialLabel = partial;
  scanStatus.textContent = message;
  scanChoices.innerHTML = choices.map(({ name, score }, index) => `
    <button type="button" class="button quiet" data-choose="${index}">
      ${escapeHTML(name)}${Number.isFinite(score) ? `<span class="meta">Model score ${numberFormat.format(score * 100)}% · not a guarantee</span>` : ""}
    </button>`).join("");
  byId("scan-options").hidden = false;
  byId("scan-manual").hidden = scanAction.value === "take";
  (scanChoices.querySelector("button") ?? byId("scan-manual")).focus();
}

function reviewFields(fields) {
  scanDialog.close();
  openFoodForm(null, { ...fields, expiration_date: Core.validDate(fields.expiration_date) ? fields.expiration_date : "" });
}

function produceFields(match) {
  const profile = Core.CATALOG[match.key];
  const saved = Core.remembered(profile.name, state);
  const useSaved = saved && /^unbranded/i.test(saved.company) && Number.isFinite(saved.quantity_g);
  return {
    name: profile.name, company: "Unbranded produce",
    quantity_g: useSaved ? saved.quantity_g : profile.defaultGrams,
    input_source: "Camera produce",
    quantity_source: useSaved ? "Memory" : "Reference portion",
    confidence: match.score
  };
}

function reviewMeal(fields) {
  const exact = Core.catalogFor(fields.name);
  if (exact) {
    reviewFields({ ...fields, name: exact.name, quantity_g: exact.defaultGrams ?? null,
      quantity_source: exact.defaultGrams ? "Reference portion" : "Entered" });
  } else {
    scanDialog.close();
    openFoodCatalogue(fields.name, fields);
  }
}

function handleLabel(result) {
  const fields = { ...result, date_kind: result.dateKind, input_source: "Camera label", quantity_source: "Label" };
  const taking = scanAction.value === "take";
  const goodName = result.explicitName && fields.name && fields.confidence >= 65;
  if (taking && goodName) { scanTakeOut(fields); return; }

  if (!goodName) {
    const names = result.alternatives.length ? result.alternatives : fields.name ? [fields.name] : [];
    if (names.length === 1 && !taking) { reviewFields({ ...fields, name: names[0] }); return; }
    showChoices(names.map((name) => ({ name, fields: { ...fields, name } })),
      names.length ? "Select the food shown on the label." : "The food name is unclear. Try a closer label photo or enter it by hand.", fields);
    return;
  }

  const dateValid = Core.validDate(fields.expiration_date);
  const storage = Core.catalogFor(fields.name)?.storage;
  const canEstimate = !fields.datePrinted && storage && !storage.condition.startsWith("Opened");
  if (!fields.company || !Number.isFinite(fields.quantity_g) || (!dateValid && !canEstimate)) {
    reviewFields(fields);
    return;
  }
  const food = Core.makeFood(fields, state.date);
  Core.saveFood(state, food);
  scanDialog.close();
  showFridge();
  update(`${food.name} added by camera · ${weightText(food)}.`);
}

async function scanFrame(canvas, mode = scanMode.value) {
  if (scanBusy || !scanDialog.open) return;
  const version = ++scanVersion;
  clearChoices();
  setScanControls(true);
  stopCamera();
  displayScanImage(canvas.toDataURL("image/jpeg", 0.9), mode === "label" ? "Loading the label reader…" : mode === "meal" ? "Checking the meal photo…" : "Loading food recognition and checking your photo… The first scan may take a moment.");
  let timeout;
  try {
    const analyze = mode === "label" ? Vision.readLabel(canvas, (message) => {
      if (version === scanVersion && scanDialog.open) scanStatus.textContent = message;
    }) : mode === "meal" ? Vision.identifyMeal(canvas) : Vision.identifyProduce(canvas);
    const result = await Promise.race([analyze, new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error("The scan took too long. Try a clearer photo or enter food by hand."));
        if (mode === "meal") Vision.stopMealWorker();
      }, 45000);
    })]);
    if (version !== scanVersion || !scanDialog.open) return;
    if (mode === "label") {
      handleLabel(result);
      return;
    }
    const matches = mode === "meal"
      ? result.matches.map(({ name, score }) => ({
        name, score, meal: true,
        fields: { name, company: "Unbranded", input_source: "Meal photo", quantity_source: "Entered", confidence: score, photo_label: name }
      }))
      : result.matches.map((match) => ({ ...match, name: Core.CATALOG[match.key].name }));
    const prompt = result.message || (!matches.length ? "No clear match. Try one food in good light, or enter it by hand."
      : result.uncertain ? "This photo could match more than one food. Choose the right one or enter it by hand."
      : "Check the suggested food and choose it to continue.");
    showChoices(matches, prompt);
  } catch (error) {
    if (version === scanVersion && scanDialog.open) showChoices([],error.message || "Couldn’t read this image. Try again or enter the food manually.");
  } finally {
    clearTimeout(timeout);
    if (version === scanVersion) setScanControls(false);
  }
}

scanChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-choose]");
  if (!button) return;
  const selected = choices[Number(button.dataset.choose)];
  if (!selected) return;
  if (scanAction.value === "take") {
    scanTakeOut(selected.fields ?? { name: selected.name });
  } else if (selected.meal) {
    reviewMeal(selected.fields);
  } else {
    reviewFields(selected.fields ?? produceFields(selected));
  }
});
byId("scan-manual").addEventListener("click", () => {
  if (partialLabel) reviewFields(partialLabel);
  else { scanDialog.close(); openFoodForm(); }
});
byId("scan-coverage-summary").textContent = `${numberFormat.format(Object.keys(Core.CATALOG).length)} catalogue foods · ${numberFormat.format(mealLabelCount)} meal labels`;
byId("scan-produce-list").textContent = `Fruit and vegetable mode covers ${cameraFoods.length} foods: ${cameraFoods.join(", ")}.`;

for (const button of document.querySelectorAll("[data-open-scan]")) button.addEventListener("click", openScanner);
for (const button of document.querySelectorAll("[data-open-label]")) button.addEventListener("click", () => {
  byId("demo-label").src = Vision.demoLabel(demoUseBy()).toDataURL("image/png");
  labelDialog.showModal();
});
byId("print-label").addEventListener("click", () => window.print());

scanDialog.addEventListener("close", () => {
  scanVersion += 1;
  stopCamera();
  clearChoices();
});
scanMode.addEventListener("change", () => {
  clearChoices();
  const mode = scanMode.value;
  cancelAutoCapture();
  if (mode === "produce") void Vision.prepareProduce();
  byId("produce-demo").hidden = mode !== "produce";
  sampleButton.textContent = mode === "label" ? "Try sample label" : mode === "meal" ? "Try sample falafel photo" : "Try sample photo";
  scanStatus.textContent = mode === "label" ? "Keep the product name and printed fields in view."
    : mode === "meal" ? "Show one dish or snack, filling most of the frame."
    : "Show one whole fruit or vegetable against a plain background in soft, even light. Avoid shadows and glare.";
  if (stream) scheduleAutoCapture();
});
scanAction.addEventListener("change", () => { clearChoices(); if (stream) scheduleAutoCapture(); });
autoCapture.addEventListener("change", () => { if (autoCapture.checked) scheduleAutoCapture(); else { cancelAutoCapture(); if (stream) scanStatus.textContent = "Hold the food steady and select Scan now."; } });
cameraButtons[0].addEventListener("click", startCamera);
cameraButtons[1].addEventListener("click", () => {
  try { void scanFrame(Vision.frame(camera, camera.videoWidth, camera.videoHeight)); }
  catch (error) { scanStatus.textContent = error.message; }
});
cameraButtons[2].addEventListener("click", stopCamera);
sampleButton.addEventListener("click", async () => {
  if (scanMode.value === "label") {
    await scanFrame(Vision.demoLabel(demoUseBy()), "label");
    return;
  }
  try {
    const mode = scanMode.value;
    const image = await waitForImage(mode === "meal" ? Vision.sampleMealURL() : Vision.sampleProduceURL(photoSample.value));
    await scanFrame(Vision.frame(image, image.naturalWidth, image.naturalHeight), mode);
  } catch (error) {
    scanStatus.textContent = error.message;
  }
});
photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const image = await waitForImage(url);
    await scanFrame(Vision.frame(image, image.naturalWidth, image.naturalHeight));
  } catch (error) {
    scanStatus.textContent = error.message;
  } finally {
    URL.revokeObjectURL(url);
  }
});
