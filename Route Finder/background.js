let isScanning = false;
let currentProgress = 0;
let currentMessage = "Initializing...";
let routesByOrigin = {};
let abortFlag = false;

// Listener for messages from popup/background and now from injected script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_SCAN") {
    abortFlag = false;
    startScan(message.tabId, message.origin);
    sendResponse({ success: true });
  } else if (message.type === "STOP_SCAN") {
    stopScan();
    sendResponse({ success: true });
  } else if (message.type === "GET_SCAN_STATUS") {
    sendResponse({
      isScanning,
      progress: currentProgress,
      message: currentMessage,
    });
  } else if (message.type === "INTERNAL_PROGRESS") {
    // Handle progress updates from injected script
    updateProgress(message.progress, message.message);
  } else if (message.type === "INTERNAL_REAL_TIME_UPDATE") {
    // Forward real-time route updates
    chrome.runtime.sendMessage({
      type: "REAL_TIME_UPDATE",
      origin: message.origin,
      newRoutes: message.newRoutes,
    });
  } else if (message.type === "INTERNAL_SCAN_COMPLETE") {
    // Handle completion from injected script
    chrome.runtime.sendMessage({
      type: "SCAN_COMPLETE",
      routesByOrigin: message.routesByOrigin,
    });
  } else if (message.type === "INTERNAL_SCAN_ERROR") {
    // Handle errors from injected script
    chrome.runtime.sendMessage({ type: "SCAN_ERROR", error: message.error });
  }
});

async function startScan(tabId, origin, auto = false) {
  if (isScanning) return;
  isScanning = true;
  abortFlag = false;

  try {
    const isSPA = await chrome.scripting.executeScript({
      target: { tabId },
      function: checkIsSPA,
    });

    if (isSPA[0].result) {
      chrome.runtime.sendMessage({ type: "IS_SPA" });
    } else {
      chrome.runtime.sendMessage({ type: "NOT_SPA" });
    }

    // Proceed with scan regardless

    // Inject and execute the scan function (no non-serializable args)
    await chrome.scripting.executeScript({
      target: { tabId },
      function: scanForRoutes,
      args: [origin], // Only pass serializable origin
    });

    // Note: The injected function will send messages back for progress/completion
  } catch (error) {
    if (!abortFlag) {
      chrome.runtime.sendMessage({ type: "SCAN_ERROR", error });
    }
  } finally {
    isScanning = false;
  }
}

function stopScan() {
  abortFlag = true;
  isScanning = false;
  currentProgress = 0;
  currentMessage = "Scan stopped";
  chrome.runtime.sendMessage({
    type: "PROGRESS_UPDATE",
    progress: 0,
    message: "Scan stopped",
  });
}

function updateProgress(percent, message) {
  currentProgress = percent;
  currentMessage = message;
  chrome.runtime.sendMessage({
    type: "PROGRESS_UPDATE",
    progress: percent,
    message,
  });
}

function checkIsSPA() {
  const spaIndicators = [
    "react",
    "vue",
    "angular",
    "next.js",
    "nuxt",
    "svelte", // Frameworks
    "webpack",
    "parcel",
    "vite", // Bundlers often used in SPAs
  ];

  const scripts = Array.from(document.getElementsByTagName("script")).map((s) =>
    s.src.toLowerCase()
  );
  const hasFramework = scripts.some((src) =>
    spaIndicators.some((ind) => src.includes(ind))
  );

  const usesHistoryAPI =
    !!window.history.pushState &&
    document.querySelectorAll("[data-reactroot],[vue-app],[ng-app]").length > 0;

  return hasFramework || usesHistoryAPI;
}

function scanForRoutes(origin) {
  // This function runs in the content script context
  // Send all progress/updates via messages to background

  let aborted = false;

  // Listen for abort message from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "STOP_SCAN") {
      aborted = true;
    }
  });

  // Helper to send progress to background
  const sendProgress = (percent, message) => {
    chrome.runtime.sendMessage({
      type: "INTERNAL_PROGRESS",
      progress: percent,
      message,
    });
  };

  // Helper to send real-time routes
  const sendRealTimeUpdate = (newRoutes) => {
    chrome.runtime.sendMessage({
      type: "INTERNAL_REAL_TIME_UPDATE",
      origin,
      newRoutes,
    });
  };

  // Helper to send completion
  const sendComplete = (uniqueRoutes) => {
    chrome.runtime.sendMessage({
      type: "INTERNAL_SCAN_COMPLETE",
      routesByOrigin: { [origin]: uniqueRoutes },
    });
  };

  // Helper to send error
  const sendError = (error) => {
    chrome.runtime.sendMessage({ type: "INTERNAL_SCAN_ERROR", error });
  };

  sendProgress(10, "Scanning page resources...");

  const routes = new Set();
  const processedResources = new Set();

  const patterns = [
    /[%27"]((?:\/|\.\.\/|\.\/)[^%27"]+)[%27"]/g, // From your first code
    /(?<=(\"|\'|\`))\/[a-zA-Z0-9_?&=\/\-\#\.]*(?=(\"|\'|\`))/g, // From your second code
    /route[s]?[\s]*[:=][\s]*['\"]([^'\"]+)['\"]/gi,
    /path[\s]*[:=][\s]*['\"]([^'\"]+)['\"]/gi,
  ];

  const isValidPath = (path) => {
    return (
      (path.startsWith("/") ||
        path.startsWith("./") ||
        path.startsWith("../")) &&
      !path.includes(" ") &&
      !/[^\x20-\x7E]/.test(path) &&
      path.length > 1 &&
      path.length < 200
    );
  };

  const extractPaths = (content) => {
    const paths = [];
    patterns.forEach((pattern) => {
      const matches = [...content.matchAll(pattern)];
      matches.forEach((match) => {
        const path = match[1] || match[0];
        if (isValidPath(path)) paths.push(path);
      });
    });
    return paths;
  };

  const fetchAndProcess = async (url) => {
    if (processedResources.has(url) || aborted) return;
    processedResources.add(url);
    console.log(`Fetching and processing: ${url}`); // Debug log like your first code

    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        const paths = extractPaths(content);
        paths.forEach((path) => routes.add(path));
        // Real-time update after each resource (quick feedback)
        sendRealTimeUpdate(paths);
      } else {
        console.error(`Failed to fetch ${url}: ${response.status}`);
      }
    } catch (error) {
      if (!aborted) {
        console.error(`Error fetching ${url}:`, error);
        sendError(error);
      }
    }
  };

  // Process resources (from your first code)
  const resources = performance.getEntriesByType("resource").map((e) => e.name);
  console.log("Resources found:", resources); // Debug like original
  const jsResources = resources.filter(
    (url) =>
      url.includes(".js") || url.includes("chunk") || url.includes("bundle")
  );

  (async () => {
    sendProgress(30, "Processing JavaScript files...");
    for (let i = 0; i < jsResources.length; i++) {
      if (aborted) return;
      await fetchAndProcess(jsResources[i]);
      sendProgress(
        30 + (i / jsResources.length) * 30,
        `Processing ${i + 1}/${jsResources.length} files...`
      );
    }

    // Scan script tags and page content (from your second code)
    sendProgress(70, "Scanning page content...");
    const scripts = document.getElementsByTagName("script");
    const regex = patterns[1]; // Use the regex from second code

    for (let i = 0; i < scripts.length; i++) {
      if (aborted) return;
      const src = scripts[i].src;
      if (src) {
        await fetchAndProcess(src);
      }
    }

    const pageContent = document.documentElement.outerHTML;
    const matches = pageContent.matchAll(regex);
    const pagePaths = [];
    for (const match of matches) {
      if (isValidPath(match[0])) pagePaths.push(match[0]);
    }
    pagePaths.forEach((path) => routes.add(path));
    sendRealTimeUpdate(pagePaths);

    sendProgress(90, "Finalizing results...");

    setTimeout(() => {
      if (aborted) return;
      const uniqueRoutes = Array.from(routes).filter(
        (route) => route && route.length > 1
      );
      console.log("Final list of unique paths:", uniqueRoutes); // Debug like original
      sendProgress(100, `Found ${uniqueRoutes.length} routes`);

      sendComplete(uniqueRoutes);
    }, 500); // Short delay like your second code's setTimeout
  })();
}
