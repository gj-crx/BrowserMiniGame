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

  const speedSlider = document.getElementById("gol-speed");
  const speedValueLabel = document.getElementById("gol-speed-value");

  const cellSizeSlider = document.getElementById("gol-cell-size");
  const cellSizeValueLabel = document.getElementById("gol-cell-size-value");

  let isPlaying = false;
  let intervalId = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  class GameOfLife {
    constructor(canvasElement, context2d) {
      this.canvas = canvasElement;
      this.context = context2d;

      this.cellSizePixels = clamp(parseInt(cellSizeSlider?.value || "12", 10), 4, 24);
      this.setGridSizeFromCanvas();

      this.cells = new Uint8Array(this.gridWidth * this.gridHeight);
      this.scratch = new Uint8Array(this.gridWidth * this.gridHeight);

      this.isMouseDown = false;
      this.dragModeSetAlive = true; // true = painting alive, false = erasing

      this.backgroundColor = "#ffffff";
      this.gridColor = "#e9ecef";
      this.cellColor = "#212529";

      this.attachEventHandlers();
      this.draw();
    }

    setGridSizeFromCanvas() {
      this.gridWidth = Math.floor(this.canvas.width / this.cellSizePixels);
      this.gridHeight = Math.floor(this.canvas.height / this.cellSizePixels);
    }

    resizeWithCellSize(newCellSize) {
      const previousCells = this.cells;
      const previousWidth = this.gridWidth;
      const previousHeight = this.gridHeight;

      this.cellSizePixels = clamp(newCellSize, 4, 24);
      this.setGridSizeFromCanvas();

      this.cells = new Uint8Array(this.gridWidth * this.gridHeight);
      this.scratch = new Uint8Array(this.gridWidth * this.gridHeight);

      // Copy as much of the old pattern as fits in the new grid
      const copyWidth = Math.min(previousWidth, this.gridWidth);
      const copyHeight = Math.min(previousHeight, this.gridHeight);
      for (let y = 0; y < copyHeight; y++) {
        for (let x = 0; x < copyWidth; x++) {
          this.cells[y * this.gridWidth + x] = previousCells[y * previousWidth + x];
        }
      }

      this.draw();
    }

    index(x, y) {
      return y * this.gridWidth + x;
    }

    inBounds(x, y) {
      return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }

    toggleCellAtCanvasPoint(clientX, clientY, makeAlive) {
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left) * (this.canvas.width / rect.width) / this.cellSizePixels);
      const y = Math.floor((clientY - rect.top) * (this.canvas.height / rect.height) / this.cellSizePixels);

      if (this.inBounds(x, y)) {
        const idx = this.index(x, y);
        if (makeAlive === undefined || makeAlive === null) {
          this.cells[idx] = this.cells[idx] ? 0 : 1;
        } else {
          this.cells[idx] = makeAlive ? 1 : 0;
        }
        this.draw();
      }
    }

    clear() {
      this.cells.fill(0);
      this.draw();
    }

    randomize(probabilityAlive = 0.25) {
      const p = clamp(probabilityAlive, 0, 1);
      for (let i = 0; i < this.cells.length; i++) {
        this.cells[i] = Math.random() < p ? 1 : 0;
      }
      this.draw();
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

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const alive = src[idx] === 1;
          const neighbors = this.countAliveNeighbors(x, y);

          if (alive) {
            dst[idx] = neighbors === 2 || neighbors === 3 ? 1 : 0;
          } else {
            dst[idx] = neighbors === 3 ? 1 : 0;
          }
        }
      }

      // swap buffers
      this.cells = dst;
      this.scratch = src;

      this.draw();
    }

    draw() {
      const ctx = this.context;
      const cellSize = this.cellSizePixels;
      const width = this.gridWidth;
      const height = this.gridHeight;

      // Clear background
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw grid lines
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

      // Draw alive cells
      ctx.fillStyle = this.cellColor;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (this.cells[y * width + x]) {
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
        // Shift to erase, otherwise paint
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

      // Keyboard shortcuts
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

      // Prevent text selection while dragging on canvas
      canvasEl.addEventListener("dragstart", (e) => e.preventDefault());
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

  speedSlider?.addEventListener("input", () => {
    updateSpeedLabel();
    if (isPlaying) {
      // Restart interval with new speed
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(() => gol.step(), currentIntervalMs());
    }
  });

  cellSizeSlider?.addEventListener("input", () => {
    const size = clamp(parseInt(cellSizeSlider.value, 10), 4, 24);
    gol.resizeWithCellSize(size);
    updateCellSizeLabel();
  });

  // Initial labels
  updateSpeedLabel();
  updateCellSizeLabel();

  // Start paused with a small random pattern to demo
  gol.randomize(0.15);
  pausePlaying();
})();