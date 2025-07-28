class SPARouteScanner {
  constructor() {
    this.allRoutesByOrigin = {};
    this.currentOrigin = null;
    this.isScanning = false;
    this.scanAbortController = null;
    this.lastFilter = "";
    this.lastSelectedOrigin = "all";
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadStoredData();
    this.updateUI();
    this.updateExportButtons(); // Enable/disable based on available routes
  }

  bindEvents() {
    document
      .getElementById("scanBtn")
      .addEventListener("click", () => this.toggleScan());

    document
      .getElementById("resetBtn")
      .addEventListener("click", () => this.resetResults());

    document
      .getElementById("exportJson")
      .addEventListener("click", () => this.exportRoutes("json"));

    document
      .getElementById("exportTxt")
      .addEventListener("click", () => this.exportRoutes("txt"));

    document
      .getElementById("exportCsv")
      .addEventListener("click", () => this.exportRoutes("csv"));

    document
      .getElementById("copyBtn")
      .addEventListener("click", () => this.copyRoutes());

    document
      .getElementById("searchInput")
      .addEventListener("input", (e) => this.filterRoutes(e.target.value));

    document
      .getElementById("originSelector")
      .addEventListener("change", (e) => this.displayResults(e.target.value));
  }

  async loadStoredData() {
    const data = await chrome.storage.local.get(["routesByOrigin"]);
    this.allRoutesByOrigin = this.sanitizeStoredOrigins(
      data.routesByOrigin || {}
    );

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    this.currentOrigin = this.originFromUrl(tab.url);
    this.displayResults("current");

    const hasRoutes = Object.keys(this.allRoutesByOrigin).length > 0;
    if (hasRoutes) {
      document.getElementById("resultsContainer").style.display = "block";
    }
    this.updateExportButtons();
  }

  sanitizeStoredOrigins(obj) {
    const out = {};
    for (const k in obj) {
      if (!k || k === "undefined") continue;
      let sk = k;
      if (sk.startsWith("http") === false && sk !== "All Origins (Filtered)")
        continue;
      out[sk] = obj[k];
    }
    return out;
  }

  originFromUrl(url) {
    try {
      return new URL(url).origin;
    } catch (e) {
      return "";
    }
  }

  async resetResults() {
    this.allRoutesByOrigin = {};
    await chrome.storage.local.clear();

    document.getElementById("searchInput").value = "";
    document.getElementById("originSelector").innerHTML =
      '<option value="current">Current Origin</option><option value="all">All Origins</option>';
    document.getElementById("originSelector").value = "current";
    document.getElementById("routesList").innerHTML = "";
    document.getElementById("routeCount").textContent = "0";

    document.getElementById("resultsContainer").style.display = "none";

    document.getElementById("progressFill").style.width = "0%";
    document.getElementById("progressText").textContent = "";
    document.getElementById("progressContainer").style.display = "none";

    this.lastFilter = "";
    this.lastSelectedOrigin = "current";

    this.updateExportButtons(); // Disable buttons after reset
    this.showStatusMessage("Results cleared successfully!", 2000);
  }

  updateExportButtons() {
    const hasRoutes = Object.keys(this.allRoutesByOrigin).length > 0;
    const exportButtons = document.querySelectorAll(".export-btn");

    exportButtons.forEach((button) => {
      button.disabled = !hasRoutes;
    });
  }

  showButtonFeedback(buttonId, originalText, feedbackText, duration = 1500) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.textContent = feedbackText;
    button.classList.add("clicked");

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("clicked");
    }, duration);
  }

  showStatusMessage(message, duration = 3000) {
    const statusElement = document.getElementById("statusMessage");
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.style.display = "block";

    setTimeout(() => {
      statusElement.style.display = "none";
    }, duration);
  }

  async toggleScan() {
    if (this.isScanning) {
      this.stopScan();
    } else {
      this.startScan();
    }
  }

  async startScan() {
    this.isScanning = true;
    this.updateButtonState();
    document.getElementById("progressContainer").style.display = "block";
    this.showStatusMessage("Checking if site is SPA...");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      this.currentOrigin = this.originFromUrl(tab.url);

      chrome.runtime.sendMessage({
        type: "START_SCAN",
        tabId: tab.id,
        origin: this.currentOrigin,
      });
    } catch (error) {
      this.handleError(error);
    }

    chrome.runtime.onMessage.addListener(this.handleMessages.bind(this));
  }

  stopScan() {
    this.isScanning = false;
    chrome.runtime.sendMessage({ type: "STOP_SCAN" });
    this.updateButtonState();
    this.updateProgress(0, "Scan stopped");
    setTimeout(() => {
      document.getElementById("progressContainer").style.display = "none";
    }, 1000);
  }

  handleMessages(message) {
    if (message.type === "PROGRESS_UPDATE") {
      this.updateProgress(message.progress, message.message);
    } else if (message.type === "REAL_TIME_UPDATE") {
      this.updateRealTimeRoutes(message.origin, message.newRoutes);
    } else if (message.type === "SCAN_COMPLETE") {
      this.allRoutesByOrigin = this.sanitizeStoredOrigins({
        ...this.allRoutesByOrigin,
        ...message.routesByOrigin,
      });
      this.saveStoredData();
      this.displayResults(this.lastSelectedOrigin);
      this.updateExportButtons(); // Enable buttons after successful scan
      this.finishScan();
    } else if (message.type === "IS_SPA") {
      this.showStatusMessage("Site detected as SPA. Starting scan.");
    } else if (message.type === "NOT_SPA") {
      this.showStatusMessage(
        "Site may not be a Single Page Application. Scanning anyway."
      );
    } else if (message.type === "SCAN_ERROR") {
      this.handleError(message.error);
      this.showStatusMessage(
        "Scan failed: " + (message.error.message || "Unknown error")
      );
    }
  }

  updateProgress(percent, message) {
    document.getElementById("progressFill").style.width = `${percent}%`;
    document.getElementById("progressText").textContent = message;
  }

  updateRealTimeRoutes(origin, newRoutes) {
    if (!this.allRoutesByOrigin[origin])
      this.allRoutesByOrigin[origin] = new Set();
    newRoutes.forEach((route) => this.allRoutesByOrigin[origin].add(route));
    this.displayResults(
      document.getElementById("originSelector").value,
      document.getElementById("searchInput").value
    );
    this.updateExportButtons(); // Update button state when new routes are found
    this.showStatusMessage("Updating routes in real-time...");
  }

  displayResults(selectedOrigin = "current", filterQuery = null) {
    this.lastSelectedOrigin = selectedOrigin;
    const routesList = document.getElementById("routesList");
    const routeCount = document.getElementById("routeCount");
    const originSelector = document.getElementById("originSelector");

    const query =
      filterQuery !== null
        ? filterQuery
        : document.getElementById("searchInput").value || "";

    originSelector.innerHTML =
      '<option value="current">Current Origin</option><option value="all">All Origins</option>';
    Object.keys(this.allRoutesByOrigin).forEach((origin) => {
      if (
        !origin ||
        origin === "undefined" ||
        origin === "All Origins (Filtered)"
      )
        return;

      const option = document.createElement("option");
      option.value = origin;
      option.textContent = origin;
      originSelector.appendChild(option);
    });

    originSelector.value = selectedOrigin;

    routesList.innerHTML = "";
    let totalCount = 0;

    if (selectedOrigin === "all") {
      Object.entries(this.allRoutesByOrigin).forEach(([origin, routesSet]) => {
        const routes = Array.from(routesSet || []);
        const matchingRoutes = routes.filter((route) =>
          route.toLowerCase().includes(query.toLowerCase())
        );

        if (matchingRoutes.length === 0) return;

        totalCount += matchingRoutes.length;

        const group = document.createElement("div");
        group.className = "origin-group";
        group.innerHTML = `<h4>${origin} (${matchingRoutes.length})</h4>`;

        matchingRoutes.forEach((route) => {
          const item = document.createElement("div");
          item.className = "route-item";
          item.textContent = route;
          item.addEventListener("click", () => this.copyToClipboard(route));
          group.appendChild(item);
        });

        routesList.appendChild(group);
      });
    } else if (selectedOrigin === "current") {
      const routes = Array.from(
        this.allRoutesByOrigin[this.currentOrigin] || []
      );
      const matchingRoutes = routes.filter((route) =>
        route.toLowerCase().includes(query.toLowerCase())
      );

      totalCount = matchingRoutes.length;

      matchingRoutes.forEach((route) => {
        const item = document.createElement("div");
        item.className = "route-item";
        item.textContent = route;
        item.addEventListener("click", () => this.copyToClipboard(route));
        routesList.appendChild(item);
      });
    } else {
      const routes = Array.from(this.allRoutesByOrigin[selectedOrigin] || []);
      const matchingRoutes = routes.filter((route) =>
        route.toLowerCase().includes(query.toLowerCase())
      );

      totalCount = matchingRoutes.length;

      matchingRoutes.forEach((route) => {
        const item = document.createElement("div");
        item.className = "route-item";
        item.textContent = route;
        item.addEventListener("click", () => this.copyToClipboard(route));
        routesList.appendChild(item);
      });
    }

    routeCount.textContent = totalCount;
    document.getElementById("resultsContainer").style.display = "block";
  }

  filterRoutes(query) {
    this.lastFilter = query;
    this.displayResults(this.lastSelectedOrigin, query);
  }

  updateButtonState() {
    const scanBtn = document.getElementById("scanBtn");
    const btnText = scanBtn.querySelector(".btn-text");

    if (this.isScanning) {
      scanBtn.classList.add("loading");
      scanBtn.disabled = true;
      btnText.textContent = "Scanning...";
    } else {
      scanBtn.classList.remove("loading");
      scanBtn.disabled = false;
      btnText.textContent = "Start Scanning";
    }
  }

  updateUI() {
    const hasRoutes = Object.keys(this.allRoutesByOrigin).length > 0;
    document.getElementById("resultsContainer").style.display = hasRoutes
      ? "block"
      : "none";
  }

  finishScan() {
    this.isScanning = false;
    this.updateButtonState();
    setTimeout(() => {
      document.getElementById("progressContainer").style.display = "none";
    }, 2000);
  }

  handleError(error) {
    console.error("Scan error:", error);
    this.isScanning = false;
    this.updateButtonState();
    setTimeout(() => {
      document.getElementById("progressContainer").style.display = "none";
    }, 1000);
  }

  async saveStoredData() {
    const storageData = {};
    Object.entries(this.allRoutesByOrigin).forEach(([origin, routesSet]) => {
      storageData[origin] = Array.from(routesSet);
    });

    await chrome.storage.local.set({ routesByOrigin: storageData });
  }

  getAllRoutes(selectedOrigin = "all") {
    let allRoutes = [];

    if (selectedOrigin === "all") {
      Object.values(this.allRoutesByOrigin).forEach((routesSet) => {
        allRoutes = allRoutes.concat(Array.from(routesSet || []));
      });
    } else if (selectedOrigin === "current") {
      allRoutes = Array.from(this.allRoutesByOrigin[this.currentOrigin] || []);
    } else {
      allRoutes = Array.from(this.allRoutesByOrigin[selectedOrigin] || []);
    }

    const query = document.getElementById("searchInput").value || "";
    return allRoutes.filter((route) =>
      route.toLowerCase().includes(query.toLowerCase())
    );
  }

  exportRoutes(format) {
    const selectedOrigin = document.getElementById("originSelector").value;
    const routes = this.getAllRoutes(selectedOrigin);

    if (routes.length === 0) {
      this.showStatusMessage("No routes to export!");
      return;
    }

    let content = "";
    let filename = "";
    let mimeType = "";
    let buttonId = "";
    let feedbackText = "";

    switch (format) {
      case "json":
        content = JSON.stringify(routes, null, 2);
        filename = `spa-routes-${Date.now()}.json`;
        mimeType = "application/json";
        buttonId = "exportJson";
        feedbackText = "Exported!";
        break;
      case "txt":
        content = routes.join("\n");
        filename = `spa-routes-${Date.now()}.txt`;
        mimeType = "text/plain";
        buttonId = "exportTxt";
        feedbackText = "Exported!";
        break;
      case "csv":
        content = "Route\n" + routes.map((route) => `"${route}"`).join("\n");
        filename = `spa-routes-${Date.now()}.csv`;
        mimeType = "text/csv";
        buttonId = "exportCsv";
        feedbackText = "Exported!";
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    this.showButtonFeedback(buttonId, format.toUpperCase(), feedbackText);
    this.showStatusMessage(
      `Exported ${routes.length} routes as ${format.toUpperCase()}!`
    );
  }

  async copyRoutes() {
    const selectedOrigin = document.getElementById("originSelector").value;
    const routes = this.getAllRoutes(selectedOrigin);

    if (routes.length === 0) {
      this.showStatusMessage("No routes to copy!");
      return;
    }

    try {
      await navigator.clipboard.writeText(routes.join("\n"));
      this.showButtonFeedback("copyBtn", "Copy", "Copied!");
      this.showStatusMessage(`Copied ${routes.length} routes to clipboard!`);
    } catch (error) {
      console.error("Failed to copy routes:", error);
      this.showStatusMessage("Failed to copy routes to clipboard!");
    }
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showStatusMessage(`Copied: ${text}`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new SPARouteScanner();
});
