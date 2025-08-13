(function () {
  "use strict";

  const canvas = document.getElementById("gol-canvas");
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d", { alpha: false });

  const playButton = document.getElementById("gol-play");
  const pauseButton = document.getElementById("gol-pause");
  const stepButton = document.getElementById("gol-step");
  const clearButton = document.getElementById("gol-clear");
  const randomButton = document.getElementById("gol-random");
  const ageButton = document.getElementById("gol-age");

  const speedSlider = document.getElementById("gol-speed");
  const speedValueLabel = document.getElementById("gol-speed-value");

  const cellSizeSlider = document.getElementById("gol-cell-size");
  const cellSizeValueLabel = document.getElementById("gol-cell-size-value");

  const generationLabel = document.getElementById("gol-generation");
  const liveLabel = document.getElementById("gol-live");
  const sparklineCanvas = document.getElementById("gol-sparkline");
  const sparkCtx = sparklineCanvas?.getContext("2d");

  let isPlaying = false;
  let intervalId = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class CircularBuffer {
    constructor(capacity) {
      this.capacity = capacity;
      this.items = new Array(capacity).fill(0);
      this.index = 0;
      this.size = 0;
    }
    push(value) {
      this.items[this.index] = value;
      this.index = (this.index + 1) % this.capacity;
      this.size = Math.min(this.size + 1, this.capacity);
    }
    forEach(callback) {
      for (let i = 0; i < this.size; i++) {
        const idx = (this.index - this.size + i + this.capacity) % this.capacity;
        callback(this.items[idx], i);
      }
    }
    max() {
      let m = 1;
      this.forEach((v) => { if (v > m) m = v; });
      return m;
    }
  }

  class GameOfLife {
    constructor(canvasElement, context2d) {
      this.canvas = canvasElement;
      this.context = context2d;

      this.cellSizePixels = clamp(parseInt(cellSizeSlider?.value || "12", 10), 4, 24);
      this.setGridSizeFromCanvas();

      this.cells = new Uint8Array(this.gridWidth * this.gridHeight);
      this.scratch = new Uint8Array(this.gridWidth * this.gridHeight);
      this.ages = new Uint16Array(this.gridWidth * this.gridHeight);

      this.isMouseDown = false;
      this.dragModeSetAlive = true;

      this.backgroundColor = "#ffffff";
      this.gridColor = "#e9ecef";
      this.cellColor = "#212529";

      this.isAgeShadingEnabled = false;
      this.generation = 0;
      this.liveCount = 0;
      this.liveHistory = new CircularBuffer(120);

      this.attachEventHandlers();
      this.draw();
      this.updateStats();
    }

    setGridSizeFromCanvas() {
      this.gridWidth = Math.floor(this.canvas.width / this.cellSizePixels);
      this.gridHeight = Math.floor(this.canvas.height / this.cellSizePixels);
    }

    resizeWithCellSize(newCellSize) {
      const previousCells = this.cells;
      const previousAges = this.ages;
      const previousWidth = this.gridWidth;
      const previousHeight = this.gridHeight;

      this.cellSizePixels = clamp(newCellSize, 4, 24);
      this.setGridSizeFromCanvas();

      this.cells = new Uint8Array(this.gridWidth * this.gridHeight);
      this.scratch = new Uint8Array(this.gridWidth * this.gridHeight);
      this.ages = new Uint16Array(this.gridWidth * this.gridHeight);

      const copyWidth = Math.min(previousWidth, this.gridWidth);
      const copyHeight = Math.min(previousHeight, this.gridHeight);
      for (let y = 0; y < copyHeight; y++) {
        for (let x = 0; x < copyWidth; x++) {
          const srcIdx = y * previousWidth + x;
          const dstIdx = y * this.gridWidth + x;
          this.cells[dstIdx] = previousCells[srcIdx];
          this.ages[dstIdx] = previousAges[srcIdx];
        }
      }

      this.draw();
      this.updateStats();
    }

    index(x, y) {
      return y * this.gridWidth + x;
    }

    inBounds(x, y) {
      return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    setCell(x, y, alive) {
      if (!this.inBounds(x, y)) return;
      const idx = this.index(x, y);
      const current = this.cells[idx] === 1;
      if (alive && !current) {
        this.cells[idx] = 1;
        this.ages[idx] = 1;
        this.liveCount += 1;
      } else if (!alive && current) {
        this.cells[idx] = 0;
        this.ages[idx] = 0;
        this.liveCount -= 1;
      }
    }

    toggleCellAtCanvasPoint(clientX, clientY, makeAlive) {
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left) * (this.canvas.width / rect.width) / this.cellSizePixels);
      const y = Math.floor((clientY - rect.top) * (this.canvas.height / rect.height) / this.cellSizePixels);

      if (!this.inBounds(x, y)) return;
      const idx = this.index(x, y);
      const targetAlive = (makeAlive === undefined || makeAlive === null) ? this.cells[idx] === 0 : !!makeAlive;
      this.setCell(x, y, targetAlive);
      this.draw();
      this.updateStats();
    }

    clear() {
      this.cells.fill(0);
      this.scratch.fill(0);
      this.ages.fill(0);
      this.generation = 0;
      this.liveCount = 0;
      this.liveHistory = new CircularBuffer(120);
      this.draw();
      this.updateStats();
    }

    randomize(probabilityAlive = 0.25) {
      const p = clamp(probabilityAlive, 0, 1);
      this.cells.fill(0);
      this.ages.fill(0);
      this.liveCount = 0;
      for (let i = 0; i < this.cells.length; i++) {
        if (Math.random() < p) {
          this.cells[i] = 1;
          this.ages[i] = 1;
          this.liveCount += 1;
        }
      }
      this.generation = 0;
      this.liveHistory = new CircularBuffer(120);
      this.draw();
      this.updateStats();
    }

    countAliveNeighbors(x, y) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.inBounds(nx, ny)) {
            count += this.cells[this.index(nx, ny)];
          }
        }
      }
      return count;
    }

    step() {
      const width = this.gridWidth;
      const height = this.gridHeight;
      const src = this.cells;
      const dst = this.scratch;

      let nextLiveCount = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const alive = src[idx] === 1;
          const neighbors = this.countAliveNeighbors(x, y);

          let willLive = 0;
          if (alive) {
            willLive = (neighbors === 2 || neighbors === 3) ? 1 : 0;
          } else {
            willLive = (neighbors === 3) ? 1 : 0;
          }
          dst[idx] = willLive;
          if (willLive) nextLiveCount += 1;
        }
      }

      // update ages and swap
      for (let i = 0; i < dst.length; i++) {
        if (dst[i]) {
          this.ages[i] = this.cells[i] ? (this.ages[i] + 1) : 1;
        } else {
          this.ages[i] = 0;
        }
      }

      this.cells = dst;
      this.scratch = src;

      this.generation += 1;
      this.liveCount = nextLiveCount;
      this.liveHistory.push(this.liveCount);

      this.draw();
      this.updateStats();
    }

    draw() {
      const ctx = this.context;
      const cellSize = this.cellSizePixels;
      const width = this.gridWidth;
      const height = this.gridHeight;

      // background
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // grid
      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x++) {
        const px = x * cellSize + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height * cellSize);
      }
      for (let y = 0; y <= height; y++) {
        const py = y * cellSize + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width * cellSize, py);
      }
      ctx.stroke();

      // cells
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (this.cells[idx]) {
            if (this.isAgeShadingEnabled) {
              const age = this.ages[idx];
              const shade = Math.min(255, 30 + age * 10);
              ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
            } else {
              ctx.fillStyle = this.cellColor;
            }
            ctx.fillRect(
              x * cellSize + 1,
              y * cellSize + 1,
              cellSize - 1,
              cellSize - 1
            );
          }
        }
      }
    }

    attachEventHandlers() {
      const canvasEl = this.canvas;

      canvasEl.addEventListener("mousedown", (e) => {
        this.isMouseDown = true;
        this.dragModeSetAlive = !e.shiftKey;
        this.toggleCellAtCanvasPoint(e.clientX, e.clientY, this.dragModeSetAlive);
      });
      window.addEventListener("mouseup", () => {
        this.isMouseDown = false;
      });
      canvasEl.addEventListener("mousemove", (e) => {
        if (!this.isMouseDown) return;
        this.toggleCellAtCanvasPoint(e.clientX, e.clientY, this.dragModeSetAlive);
      });

      canvasEl.addEventListener("keydown", (e) => {
        if (e.code === "Space") {
          e.preventDefault();
          togglePlay();
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          gol.step();
        } else if (e.code === "KeyR" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          gol.randomize();
        } else if (e.code === "KeyC" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          gol.clear();
        }
      });

      canvasEl.addEventListener("dragstart", (e) => e.preventDefault());
    }

    updateStats() {
      if (generationLabel) generationLabel.textContent = String(this.generation);
      if (liveLabel) liveLabel.textContent = String(this.liveCount);
      if (sparkCtx && sparklineCanvas) {
        const w = sparklineCanvas.width, h = sparklineCanvas.height;
        sparkCtx.clearRect(0, 0, w, h);
        sparkCtx.strokeStyle = "#198754";
        sparkCtx.lineWidth = 2;
        const maxVal = Math.max(1, this.liveHistory.max());
        sparkCtx.beginPath();
        let first = true;
        this.liveHistory.forEach((val, i) => {
          const x = (i / Math.max(1, this.liveHistory.size - 1)) * (w - 4) + 2;
          const y = h - 2 - (val / maxVal) * (h - 4);
          if (first) { sparkCtx.moveTo(x, y); first = false; }
          else { sparkCtx.lineTo(x, y); }
        });
        sparkCtx.stroke();
      }
    }
  }

  const gol = new GameOfLife(canvas, context);

  function currentIntervalMs() {
    const gensPerSecond = clamp(parseInt(speedSlider?.value || "10", 10), 1, 60);
    return Math.floor(1000 / gensPerSecond);
  }

  function updateSpeedLabel() {
    const gensPerSecond = clamp(parseInt(speedSlider?.value || "10", 10), 1, 60);
    if (speedValueLabel) speedValueLabel.textContent = `${gensPerSecond} gen/s`;
  }

  function updateCellSizeLabel() {
    const size = clamp(parseInt(cellSizeSlider?.value || "12", 10), 4, 24);
    if (cellSizeValueLabel) cellSizeValueLabel.textContent = `${size} px`;
  }

  function startPlaying() {
    if (isPlaying) return;
    isPlaying = true;
    if (intervalId) window.clearInterval(intervalId);
    intervalId = window.setInterval(() => gol.step(), currentIntervalMs());
    updatePlayPauseButtons();
  }

  function pausePlaying() {
    if (!isPlaying) return;
    isPlaying = false;
    if (intervalId) window.clearInterval(intervalId);
    intervalId = null;
    updatePlayPauseButtons();
  }

  function togglePlay() {
    if (isPlaying) pausePlaying(); else startPlaying();
  }

  function updatePlayPauseButtons() {
    if (playButton) playButton.disabled = isPlaying;
    if (pauseButton) pauseButton.disabled = !isPlaying;
  }

  // Wire up controls
  playButton?.addEventListener("click", startPlaying);
  pauseButton?.addEventListener("click", pausePlaying);
  stepButton?.addEventListener("click", () => gol.step());
  clearButton?.addEventListener("click", () => gol.clear());
  randomButton?.addEventListener("click", () => gol.randomize());
  ageButton?.addEventListener("click", () => {
    gol.isAgeShadingEnabled = !gol.isAgeShadingEnabled;
    ageButton.textContent = `Age shading: ${gol.isAgeShadingEnabled ? 'On' : 'Off'}`;
    gol.draw();
  });

  speedSlider?.addEventListener("input", () => {
    updateSpeedLabel();
    if (isPlaying) {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(() => gol.step(), currentIntervalMs());
    }
  });

  cellSizeSlider?.addEventListener("input", () => {
    const size = clamp(parseInt(cellSizeSlider.value, 10), 4, 24);
    gol.resizeWithCellSize(size);
    updateCellSizeLabel();
  });

  // Initial labels and state
  updateSpeedLabel();
  updateCellSizeLabel();

  gol.randomize(0.15);
  pausePlaying();
})();