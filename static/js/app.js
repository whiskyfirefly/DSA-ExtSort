let data = [];
let sortedData = [];

const LARGE_DATA_THRESHOLD = 1_000;
const MAX_RENDER_VALUES = 300;
const MAX_RENDER_CHUNKS = 40;
const MAX_CHUNK_HISTORY_STEPS = 16;

let disableHeapVisualization = false;
let largeDataMode = false;
let isPaused = false;
let isSorting = false;
let pauseResolver = null;
let sortRunId = 0;
const SORT_CANCELLED = "SORT_CANCELLED";
let showAllOutputMode = false;
let chunkHistorySteps = [];
let showAllTimelineSteps = true;

const $ = (id) => document.getElementById(id);

function getSpeed() {
    const speed = parseInt($("speedControl").value, 10);
    return Number.isNaN(speed) ? 600 : speed;
}

$("speedControl").oninput = function () {
    $("speedValue").innerText = this.value + " ms";
};

function sleep() {
    return new Promise((resolve) => setTimeout(resolve, getSpeed()));
}

function setStatus(message) {
    $("statusMessage").innerText = message || "";
}

function ensureRunActive(runId) {
    if (runId !== sortRunId) {
        throw new Error(SORT_CANCELLED);
    }
}

function cancelCurrentSort(reason) {
    if (!isSorting) {
        return;
    }

    sortRunId++;
    isPaused = false;
    if (pauseResolver) {
        pauseResolver();
        pauseResolver = null;
    }
    setSortingUI(false);
    if (reason) {
        setStatus(reason);
    }
}

async function waitWhilePaused(runId) {
    ensureRunActive(runId);
    while (isPaused) {
        await new Promise((resolve) => {
            pauseResolver = resolve;
        });
        pauseResolver = null;
        ensureRunActive(runId);
    }
}

async function waitStep(runId) {
    await waitWhilePaused(runId);
    ensureRunActive(runId);
    await sleep();
    ensureRunActive(runId);
    await waitWhilePaused(runId);
}

function resetPauseState() {
    isPaused = false;
    $("pauseBtn").innerText = "Pause";
}

function setSortingUI(running) {
    isSorting = running;
    $("startBtn").disabled = running;
    $("pauseBtn").disabled = !running;
    syncTimelineToggleState();

    if (!running) {
        resetPauseState();
    }
}

function evaluateDataSizeMode() {
    largeDataMode = data.length >= LARGE_DATA_THRESHOLD;
    disableHeapVisualization = largeDataMode;

    if (largeDataMode) {
        $("heapTree").innerHTML =
            '<div class="info-message">Kich thuoc du lieu lon (>= 1,000). Da tat toan bo minh hoa.</div>';
    }
}

function formatValues(values, maxValues = MAX_RENDER_VALUES) {
    if (maxValues == null || values.length <= maxValues) {
        return values;
    }
    return values.slice(0, maxValues);
}

function renderCells(values, containerId, maxValues = MAX_RENDER_VALUES) {
    const area = $(containerId);
    const renderValues = formatValues(values, maxValues);

    area.innerHTML = renderValues
        .map((v) => `<span class="cell">${v.toFixed(2)}</span>`)
        .join("");

    if (maxValues != null && values.length > maxValues) {
        area.innerHTML += `<div class="info-message">Dang hien thi ${maxValues}/${values.length} gia tri.</div>`;
    }
}

function renderInputData() {
    renderCells(data, "inputArea");
}

function clearVisualizationAreas() {
    $("diskArea").innerHTML = "";
    $("ramArea").innerHTML = "";
    $("heapTree").innerHTML = "";
    $("outputArea").innerHTML = "";
    chunkHistorySteps = [];
    renderChunkHistory();
}

function clearSortPanels() {
    $("diskArea").innerHTML = "";
    $("ramArea").innerHTML = "";
    $("heapTree").innerHTML = "";
}

function applyLoadedData(nums, statusText) {
    data = nums;
    sortedData = [];
    showAllOutputMode = false;
    clearVisualizationAreas();
    renderInputData();
    evaluateDataSizeMode();
    setStatus(statusText);
}

function notifyLargeDataMode() {
    if (largeDataMode) {
        alert("Kich thuoc du lieu lon (>= 1,000). He thong se bo toan bo minh hoa.");
    }
}

function setShowMoreVisibility(visible) {
    const btn = $("showMoreBtn");
    if (!btn) {
        return;
    }
    btn.style.display = visible ? "inline-block" : "none";
}

function resetRunStateDisplay() {
    sortedData = [];
    showAllOutputMode = false;
    $("outputArea").innerHTML = "";
    setShowMoreVisibility(false);
    clearSortPanels();
    chunkHistorySteps = [];
    renderChunkHistory();
}

function syncTimelineToggleState() {
    const toggle = $("timelineModeToggle");
    if (!toggle) return;
    toggle.disabled = isSorting && !isPaused;
}

function tokenizeInput(text) {
    return text
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

function parseTextNumbers(text) {
    const tokens = tokenizeInput(text);

    if (tokens.length === 0) {
        return null;
    }

    const nums = tokens.map((t) => Number(t));
    if (nums.some((n) => !Number.isFinite(n))) {
        return null;
    }

    return nums;
}

function parseBinaryByteText(text) {
    const tokens = tokenizeInput(text);

    if (tokens.length === 0) {
        return null;
    }

    const isBinaryByteText = tokens.every((t) => /^[01]{8}$/.test(t));
    if (!isBinaryByteText) {
        return null;
    }

    return tokens.map((t) => parseInt(t, 2));
}

function parseFloat64Binary(buffer) {
    if (buffer.byteLength === 0 || buffer.byteLength % 8 !== 0) {
        return null;
    }

    const view = new DataView(buffer);
    const nums = [];
    for (let i = 0; i < buffer.byteLength; i += 8) {
        const v = view.getFloat64(i, true);
        if (!Number.isFinite(v)) {
            return null;
        }
        nums.push(v);
    }

    return nums;
}

// ==========================
// Upload
// ==========================
async function uploadFile() {
    cancelCurrentSort("Da huy phien sort cu do thay doi input.");

    const file = $("fileInput").files[0];
    if (!file) {
        alert("Chon file truoc!");
        return;
    }

    const buffer = await file.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

    let nums = parseBinaryByteText(text);
    let sourceType = "binary 8-bit text";

    if (!nums) {
        nums = parseTextNumbers(text);
        sourceType = "TXT";
    }

    if (!nums) {
        nums = parseFloat64Binary(buffer);
        if (nums) {
            sourceType = "binary float64";
        }
    }

    if (!nums) {
        alert("File TXT khong hop le. Ho tro: danh sach so dang text hoac binary float64 (8 bytes/so). ");
        return;
    }

    applyLoadedData(nums, `Da nap ${nums.length} gia tri tu ${sourceType}.`);
    if (!largeDataMode) {
        alert("Da nap " + data.length + " so tu file " + sourceType + ".");
    } else {
        notifyLargeDataMode();
    }
}

// ==========================
// Generate Random
// ==========================
async function generateRandom() {
    cancelCurrentSort("Da huy phien sort cu do thay doi input.");

    const n = parseInt($("randomCount").value, 10);

    if (Number.isNaN(n) || n <= 0) {
        alert("So luong phai lon hon 0.");
        return;
    }

    const res = await fetch("/api/generate-random", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n })
    });

    if (!res.ok) {
        alert("Khong the tao du lieu ngau nhien.");
        return;
    }

    const result = await res.json();
    applyLoadedData(result.nums || [], `Da tao ngau nhien ${(result.nums || []).length} gia tri.`);
    notifyLargeDataMode();
}

// ==========================
// Render Disk chunks
// ==========================
function populateChunksArea(area, chunks, activeChunk = -1, highlightIndexes = null) {
    if (!area) return;
    area.innerHTML = "";

    const shownChunks = chunks.slice(0, MAX_RENDER_CHUNKS);

    shownChunks.forEach((chunk, i) => {
        const row = document.createElement("div");
        row.className = "chunk-row";
        if (i === activeChunk) {
            row.classList.add("active-chunk-row");
        }
        row.innerHTML = `<strong>Chunk ${i}:</strong> `;

        const renderValues = formatValues(chunk);
        renderValues.forEach((val, idx) => {
            const span = document.createElement("span");
            span.className = "cell";
            if (highlightIndexes && highlightIndexes[i] === idx) {
                span.classList.add("pointer");
            }
            span.innerText = val.toFixed(2);
            row.appendChild(span);
        });

        if (chunk.length > MAX_RENDER_VALUES) {
            const note = document.createElement("span");
            note.className = "info-inline";
            note.innerText = ` ... (${chunk.length} values)`;
            row.appendChild(note);
        }

        area.appendChild(row);
    });

    if (chunks.length > MAX_RENDER_CHUNKS) {
        const note = document.createElement("div");
        note.className = "info-message";
        note.innerText = `Dang hien thi ${MAX_RENDER_CHUNKS}/${chunks.length} chunks.`;
        area.appendChild(note);
    }
}

function renderChunks(chunks, activeChunk = -1, highlightIndexes = null) {
    const area = $("diskArea");
    populateChunksArea(area, chunks, activeChunk, highlightIndexes);
}

function appendChunkHistory(title, chunks, activeChunk = -1) {
    chunkHistorySteps.push({
        title,
        chunks: chunks.map((chunk) => [...chunk]),
        activeChunk
    });

    while (chunkHistorySteps.length > MAX_CHUNK_HISTORY_STEPS) {
        chunkHistorySteps.shift();
    }

    renderChunkHistory();
}

function renderChunkHistory() {
    const historyArea = $("chunkHistoryArea");
    if (!historyArea) return;

    historyArea.innerHTML = "";
    if (chunkHistorySteps.length === 0) return;

    const steps = showAllTimelineSteps
        ? chunkHistorySteps
        : [chunkHistorySteps[chunkHistorySteps.length - 1]];

    steps.forEach((stepData) => {
        const step = document.createElement("div");
        step.className = "timeline-step";

        const stepTitle = document.createElement("div");
        stepTitle.className = "timeline-title";
        stepTitle.innerText = stepData.title;
        step.appendChild(stepTitle);

        const body = document.createElement("div");
        step.appendChild(body);
        populateChunksArea(body, stepData.chunks, stepData.activeChunk);
        historyArea.appendChild(step);
    });
}

// ==========================
// Min Heap helpers
// ==========================
function heapPush(heap, node) {
    heap.push(node);
    let i = heap.length - 1;

    while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        if (heap[p].value <= heap[i].value) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
    }
}

function heapPop(heap) {
    if (heap.length === 0) return null;
    const min = heap[0];
    const last = heap.pop();

    if (heap.length > 0) {
        heap[0] = last;
        let i = 0;

        while (true) {
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            let smallest = i;

            if (left < heap.length && heap[left].value < heap[smallest].value) {
                smallest = left;
            }
            if (right < heap.length && heap[right].value < heap[smallest].value) {
                smallest = right;
            }
            if (smallest === i) break;

            [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
            i = smallest;
        }
    }

    return min;
}

// ==========================
// Render Heap as graph tree (SVG)
// ==========================
function renderHeapTree(heap) {
    const tree = $("heapTree");
    tree.innerHTML = "";

    if (disableHeapVisualization) {
        tree.innerHTML = '<div class="info-message">Mini Heap visualization disabled for large dataset.</div>';
        return;
    }

    if (heap.length === 0) {
        tree.innerHTML = '<div class="info-message">Heap rong.</div>';
        return;
    }

    const shown = heap.slice(0, 63);
    const levels = Math.floor(Math.log2(shown.length)) + 1;
    const width = Math.max(700, Math.pow(2, levels - 1) * 120);
    const levelGap = 95;
    const topPadding = 45;
    const height = topPadding + levels * levelGap;

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "heap-svg");

    const pos = new Array(shown.length);

    for (let i = 0; i < shown.length; i++) {
        const level = Math.floor(Math.log2(i + 1));
        const firstAtLevel = Math.pow(2, level) - 1;
        const idxAtLevel = i - firstAtLevel;
        const nodesInLevel = Math.pow(2, level);

        const xGap = width / (nodesInLevel + 1);
        const x = xGap * (idxAtLevel + 1);
        const y = topPadding + level * levelGap;
        pos[i] = { x, y, level };

        if (i > 0) {
            const p = Math.floor((i - 1) / 2);
            const line = document.createElementNS(svgNs, "line");
            line.setAttribute("x1", String(pos[p].x));
            line.setAttribute("y1", String(pos[p].y));
            line.setAttribute("x2", String(x));
            line.setAttribute("y2", String(y));
            line.setAttribute("class", "heap-edge");
            svg.appendChild(line);
        }
    }

    for (let i = 0; i < shown.length; i++) {
        const node = shown[i];
        const { x, y, level } = pos[i];
        const levelClass = `heap-level-${level % 6}`;

        const circle = document.createElementNS(svgNs, "circle");
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
        circle.setAttribute("r", "22");
        circle.setAttribute("class", `heap-circle ${levelClass}`);
        svg.appendChild(circle);

        const text = document.createElementNS(svgNs, "text");
        text.setAttribute("x", String(x));
        text.setAttribute("y", String(y + 4));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "heap-label");
        text.textContent = node.value.toFixed(1);
        svg.appendChild(text);
    }

    tree.appendChild(svg);

    if (heap.length > shown.length) {
        const note = document.createElement("div");
        note.className = "info-message";
        note.innerText = `Dang hien thi ${shown.length}/${heap.length} node heap.`;
        tree.appendChild(note);
    }
}

// ==========================
// Render Output
// ==========================
function renderOutput() {
    if (showAllOutputMode) {
        renderCells(sortedData, "outputArea", null);
        setShowMoreVisibility(false);
        return;
    }

    renderCells(sortedData, "outputArea");
    setShowMoreVisibility(sortedData.length > MAX_RENDER_VALUES);
}

// ==========================
// External Merge Sort
// ==========================
async function startExternalSort() {
    cancelCurrentSort();

    if (data.length === 0) {
        alert("No data!");
        return;
    }

    const runId = ++sortRunId;
    setSortingUI(true);
    resetRunStateDisplay();
    setStatus("Dang sap xep...");

    evaluateDataSizeMode();

    const chunkSizeRaw = parseInt($("chunkSize").value, 10);
    const kWayRaw = parseInt($("kWay").value, 10);

    const chunkSize = Number.isNaN(chunkSizeRaw) || chunkSizeRaw < 1 ? 1 : chunkSizeRaw;
    const kWay = Number.isNaN(kWayRaw) || kWayRaw < 2 ? 2 : kWayRaw;

    try {
        ensureRunActive(runId);

        if (largeDataMode) {
            clearSortPanels();
            sortedData = [...data].sort((a, b) => a - b);
            renderOutput();
            ensureRunActive(runId);
            setStatus(`Da sort truc tiep ${data.length} gia tri (>= 1,000), bo qua toan bo minh hoa.`);
            return;
        }

        const chunks = [];
        for (let i = 0; i < data.length; i += chunkSize) {
            chunks.push(data.slice(i, i + chunkSize));
        }

        renderChunks(chunks);
        appendChunkHistory("Initial chunking", chunks);
        await waitStep(runId);

        for (let i = 0; i < chunks.length; i++) {
            ensureRunActive(runId);
            renderCells(chunks[i], "ramArea");
            await waitStep(runId);

            chunks[i].sort((a, b) => a - b);
            appendChunkHistory(`Chunk ${i} sorted`, chunks, i);

            renderCells(chunks[i], "ramArea");
            await waitStep(runId);
        }

        await kWayMerge(chunks, kWay, true, runId);
        ensureRunActive(runId);
        setStatus(`Da sort xong ${data.length} gia tri.`);
    } catch (err) {
        if (!(err instanceof Error) || err.message !== SORT_CANCELLED) {
            throw err;
        }
    } finally {
        if (runId === sortRunId) {
            setSortingUI(false);
        }
    }
}

// ==========================
// K-Way Merge with Heap
// ==========================
async function mergeOneGroup(groupChunks, visualize, runId) {
    ensureRunActive(runId);
    const heap = [];
    const pointers = new Array(groupChunks.length).fill(0);
    const merged = [];

    for (let i = 0; i < groupChunks.length; i++) {
        if (groupChunks[i].length > 0) {
            heapPush(heap, { value: groupChunks[i][0], chunk: i });
            pointers[i] = 1;
        }
    }

    while (heap.length > 0) {
        ensureRunActive(runId);
        if (visualize) {
            renderHeapTree(heap);
            renderChunks(groupChunks);
            await waitStep(runId);
        }

        const minNode = heapPop(heap);
        merged.push(minNode.value);

        const c = minNode.chunk;
        const consumedIndex = pointers[c] - 1;

        if (visualize) {
            const highlights = new Array(groupChunks.length).fill(-1);
            highlights[c] = consumedIndex;
            renderChunks(groupChunks, c, highlights);
            await waitStep(runId);
        }

        if (pointers[c] < groupChunks[c].length) {
            heapPush(heap, {
                value: groupChunks[c][pointers[c]],
                chunk: c
            });
            pointers[c]++;
        }

        if (visualize && merged.length % 5 === 0) {
            renderCells(merged, "ramArea");
            await waitStep(runId);
        }
    }

    if (visualize) {
        renderCells(merged, "ramArea");
    }

    return merged;
}

async function kWayMerge(chunks, kWay, visualize, runId) {
    ensureRunActive(runId);
    let runs = chunks.map((chunk) => [...chunk]);

    while (runs.length > 1) {
        ensureRunActive(runId);
        const nextRuns = [];

        for (let i = 0; i < runs.length; i += kWay) {
            ensureRunActive(runId);
            const group = runs.slice(i, i + kWay);
            const merged = await mergeOneGroup(group, visualize, runId);
            nextRuns.push(merged);

            if (visualize) {
                sortedData = [...merged];
                renderOutput();
            }
        }

        runs = nextRuns;

        if (visualize) {
            renderChunks(runs);
            appendChunkHistory(`K-way pass: ${runs.length} run(s)`, runs);
            await waitStep(runId);
        }
    }

    sortedData = runs[0] ? [...runs[0]] : [];
    renderOutput();

    if (visualize) {
        renderHeapTree([]);
        renderCells([], "ramArea");
    }
}

// ==========================
// Download Sorted
// ==========================
async function downloadSorted() {
    if (sortedData.length === 0) {
        alert("Chua co du lieu da sort");
        return;
    }

    const txt = sortedData.map((n) => n.toString()).join("\n");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "sorted_output.txt";
    a.click();

    URL.revokeObjectURL(url);
}

function togglePauseSort() {
    if (!isSorting) return;

    isPaused = !isPaused;
    $("pauseBtn").innerText = isPaused ? "Resume" : "Pause";
    setStatus(isPaused ? "Tam dung..." : "Tiep tuc...");
    syncTimelineToggleState();

    if (!isPaused && pauseResolver) {
        pauseResolver();
    }
}

function showAllOutput() {
    if (sortedData.length === 0) {
        return;
    }
    showAllOutputMode = true;
    renderOutput();
}

function handleSortConfigChanged() {
    cancelCurrentSort("Da huy phien sort cu do thay doi tham so sort.");
}

const chunkSizeInput = $("chunkSize");
if (chunkSizeInput) {
    chunkSizeInput.addEventListener("input", handleSortConfigChanged);
}

const kWayInput = $("kWay");
if (kWayInput) {
    kWayInput.addEventListener("input", handleSortConfigChanged);
}

const timelineModeToggle = $("timelineModeToggle");
if (timelineModeToggle) {
    showAllTimelineSteps = timelineModeToggle.checked;
    timelineModeToggle.addEventListener("change", () => {
        if (isSorting && !isPaused) {
            timelineModeToggle.checked = showAllTimelineSteps;
            return;
        }
        showAllTimelineSteps = timelineModeToggle.checked;
        renderChunkHistory();
    });
    syncTimelineToggleState();
}
