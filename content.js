(function () {
  "use strict";

  const APP_ID = "canvas-grade-calculator-panel";
  const whatIfScores = new Map();
  let latestEnv = null;
  let requestCounter = 0;

  injectPageReader();
  buildShell();
  setStatus("Loading Canvas data...");
  requestCanvasData().then((env) => {
    latestEnv = env;
    renderResults(latestEnv, getSelectedMode());
    setStatus(`Loaded ${env.assignment_groups.length} groups and ${env.submissions.length} submissions. Ready.`);
  }).catch((error) => {
    setStatus(`Error: ${error.message}`);
  });

  function injectPageReader() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-reader.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function requestCanvasData(timeoutMs = 2500) {
    const requestId = ++requestCounter;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Timed out while reading Canvas data."));
      }, timeoutMs);

      function handler(event) {
        if (event.source !== window) return;
        if (!event.data || event.data.source !== "CGC_PAGE_READER") return;

        clearTimeout(timeout);
        window.removeEventListener("message", handler);

        if (!event.data.ok) {
          reject(new Error(event.data.error || "Could not read Canvas grade data."));
          return;
        }

        resolve(event.data.env);
      }

      window.addEventListener("message", handler);
      window.postMessage({ source: "CGC_CONTENT", type: "REQUEST_CANVAS_ENV", requestId }, "*");
    });
  }

  function buildShell() {
    const oldPanel = document.getElementById(APP_ID);
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement("div");
    panel.id = APP_ID;

    panel.innerHTML = `
      <div class="cgc-header">
        <div>
          <div class="cgc-title">Canvas Grade Calculator</div>
          <div class="cgc-subtitle">What-if grade estimator</div>
        </div>
        <button type="button" class="cgc-close" title="Close">×</button>
      </div>

      <div class="cgc-status" id="cgc-status">Loading...</div>

      <div class="cgc-controls">
        <label>
          <input type="radio" name="cgc-mode" value="gradedOnly" checked>
          Graded only
        </label>
        <label>
          <input type="radio" name="cgc-mode" value="missingAsZero">
          Missing as 0
        </label>
      </div>

      <div class="cgc-summary">
        <div class="cgc-big-grade" id="cgc-current-grade">--</div>
        <div class="cgc-small-grade" id="cgc-weighted-grade"></div>
      </div>

      <div class="cgc-actions">
        <button type="button" id="cgc-recalculate">Recalculate Grade</button>
      </div>

      <div class="cgc-note">
        To clear what-if scores, refresh the Canvas page.
      </div>

      <div class="cgc-groups" id="cgc-groups"></div>

      <div class="cgc-footer">
        Type what-if scores, then click Recalculate Grade.
      </div>
    `;

    document.body.appendChild(panel);

    panel.addEventListener("click", async (event) => {
      const target = event.target;

      if (target.classList.contains("cgc-close")) {
        panel.remove();
        return;
      }

      if (target.id === "cgc-recalculate") {
        collectWhatIfScoresFromInputs();
        setStatus("Recalculating with fresh Canvas data...");
        try {
          latestEnv = await requestCanvasData();
          renderResults(latestEnv, getSelectedMode());
          setStatus("Recalculated. What-if scores are included.");
        } catch (error) {
          setStatus(`Error: ${error.message}`);
        }
        return;
      }
    });

    panel.addEventListener("change", (event) => {
      if (event.target.name === "cgc-mode" && latestEnv) {
        collectWhatIfScoresFromInputs();
        renderResults(latestEnv, getSelectedMode());
      }
    });
  }

  function setStatus(message) {
    const status = document.getElementById("cgc-status");
    if (status) status.textContent = message;
    console.log("[Canvas Grade Calculator]", message);
  }

  function getSelectedMode() {
    const panel = document.getElementById(APP_ID);
    return panel?.querySelector("input[name='cgc-mode']:checked")?.value || "gradedOnly";
  }

  function collectWhatIfScoresFromInputs() {
    document.querySelectorAll(".cgc-whatif-input").forEach((input) => {
      const assignmentId = input.dataset.assignmentId;
      const rawValue = input.value.trim();
      if (!assignmentId) return;

      if (rawValue === "") {
        whatIfScores.delete(assignmentId);
        return;
      }

      const score = Number(rawValue);
      if (!Number.isNaN(score)) {
        whatIfScores.set(assignmentId, score);
      }
    });
  }

  function getSubmissionByAssignmentId(submissions) {
    const map = new Map();
    submissions.forEach((submission) => {
      if (submission && submission.assignment_id) {
        map.set(String(submission.assignment_id), submission);
      }
    });
    return map;
  }

  function getGroupNamesFromPage() {
    const names = [];
    const tables = Array.from(document.querySelectorAll("table"));

    for (const table of tables) {
      const text = table.innerText || "";
      if (!text.includes("Weight")) continue;

      table.querySelectorAll("tr").forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => cell.innerText.trim());
        if (cells.length >= 2 && cells[0] && cells[0].toLowerCase() !== "group" && /\d/.test(cells[1])) {
          names.push(cells[0]);
        }
      });
    }

    return names;
  }

  function getAssignmentNameFromPage(assignmentId) {
    const link = document.querySelector(`a[href*="/assignments/${assignmentId}"]`);
    if (link && link.innerText.trim()) return link.innerText.trim();
    return `Assignment ${assignmentId}`;
  }

  function calculateGrades(env, mode) {
    const assignmentGroups = env.assignment_groups || [];
    const submissions = env.submissions || [];
    const submissionMap = getSubmissionByAssignmentId(submissions);
    const pageGroupNames = getGroupNamesFromPage();

    let totalWeightedEarned = 0;
    let totalActiveWeight = 0;

    const groupResults = assignmentGroups.map((group, index) => {
      const groupWeight = Number(group.group_weight || 0);
      const groupName = pageGroupNames[index] || `Group ${group.id}`;
      const assignments = Array.isArray(group.assignments) ? group.assignments : [];

      let earned = 0;
      let possible = 0;
      let countedCount = 0;
      let missingCount = 0;

      const assignmentResults = [];

      assignments.forEach((assignment) => {
        if (!assignment || assignment.omit_from_final_grade) return;

        const assignmentId = String(assignment.id);
        const pointsPossible = Number(assignment.points_possible || 0);
        if (!pointsPossible || pointsPossible <= 0) return;

        const submission = submissionMap.get(assignmentId);
        const actualScore = submission && submission.score !== null && submission.score !== undefined
          ? Number(submission.score)
          : null;

        const whatIfScore = whatIfScores.has(assignmentId) ? whatIfScores.get(assignmentId) : null;
        const hasWhatIf = whatIfScore !== null && !Number.isNaN(whatIfScore);
        const isActuallyGraded = submission && submission.workflow_state === "graded" && actualScore !== null && !Number.isNaN(actualScore);

        const shouldCount = hasWhatIf || isActuallyGraded || mode === "missingAsZero";
        const scoreToUse = hasWhatIf ? whatIfScore : isActuallyGraded ? actualScore : 0;

        if (shouldCount) {
          earned += scoreToUse;
          possible += pointsPossible;
          countedCount++;
        } else {
          missingCount++;
        }

        assignmentResults.push({
          id: assignmentId,
          name: getAssignmentNameFromPage(assignmentId),
          pointsPossible,
          actualScore,
          whatIfScore,
          hasWhatIf,
          isActuallyGraded,
          counted: shouldCount
        });
      });

      const hasGrade = possible > 0;
      const percentage = hasGrade ? earned / possible : null;
      const weightedPoints = hasGrade ? percentage * groupWeight : 0;

      if (hasGrade && groupWeight > 0) {
        totalWeightedEarned += weightedPoints;
        totalActiveWeight += groupWeight;
      }

      return {
        id: group.id,
        name: groupName,
        weight: groupWeight,
        earned,
        possible,
        percentage,
        weightedPoints,
        countedCount,
        missingCount,
        hasGrade,
        assignments: assignmentResults
      };
    });

    const currentGrade = totalActiveWeight > 0 ? (totalWeightedEarned / totalActiveWeight) * 100 : null;
    return { groupResults, totalWeightedEarned, totalActiveWeight, currentGrade };
  }

  function renderResults(env, mode) {
    const result = calculateGrades(env, mode);
    const currentGradeEl = document.getElementById("cgc-current-grade");
    const weightedGradeEl = document.getElementById("cgc-weighted-grade");
    const groupsEl = document.getElementById("cgc-groups");

    if (!currentGradeEl || !weightedGradeEl || !groupsEl) return;

    currentGradeEl.textContent = result.currentGrade === null ? "No graded items" : formatPercent(result.currentGrade);
    weightedGradeEl.textContent = result.currentGrade === null
      ? ""
      : `Weighted earned: ${formatPoints(result.totalWeightedEarned)} / ${formatPoints(result.totalActiveWeight)} active weight`;

    groupsEl.innerHTML = "";

    result.groupResults.forEach((group) => {
      const groupDiv = document.createElement("div");
      groupDiv.className = "cgc-group";

      const percentText = group.hasGrade ? formatPercent(group.percentage * 100) : "Not graded yet";
      const contributionText = group.hasGrade
        ? `${formatPoints(group.weightedPoints)} / ${formatPoints(group.weight)}`
        : `0 / ${formatPoints(group.weight)}`;
      const barWidth = group.hasGrade ? Math.max(0, Math.min(100, group.percentage * 100)) : 0;

      const assignmentsHtml = group.assignments.map((assignment) => {
        const placeholder = assignment.actualScore !== null && !Number.isNaN(assignment.actualScore)
          ? formatPoints(assignment.actualScore)
          : "what-if";
        const value = assignment.hasWhatIf ? assignment.whatIfScore : "";
        const status = assignment.hasWhatIf ? "Using what-if" : assignment.isActuallyGraded ? "Using actual" : "Not graded";

        return `
          <div class="cgc-assignment">
            <div class="cgc-assignment-name" title="${escapeHtml(assignment.name)}">${escapeHtml(assignment.name)}</div>
            <div class="cgc-assignment-score">
              <input class="cgc-whatif-input" data-assignment-id="${assignment.id}" type="number" min="0" step="0.01" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
              <span>/ ${formatPoints(assignment.pointsPossible)}</span>
            </div>
            <div class="cgc-assignment-status">${status}</div>
          </div>
        `;
      }).join("");

      groupDiv.innerHTML = `
        <div class="cgc-group-top">
          <strong>${escapeHtml(group.name)}</strong>
          <span>${formatPoints(group.weight)}%</span>
        </div>
        <div class="cgc-bar"><div class="cgc-bar-fill" style="width: ${barWidth}%"></div></div>
        <div class="cgc-group-details">
          <div>${percentText}</div>
          <div>${contributionText}</div>
        </div>
        <div class="cgc-group-meta">${group.countedCount} counted, ${group.missingCount} ungraded/missing</div>
        <details class="cgc-assignment-list">
          <summary>Assignments / What-if scores</summary>
          ${assignmentsHtml}
        </details>
      `;

      groupsEl.appendChild(groupDiv);
    });
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
    return `${value.toFixed(2)}%`;
  }

  function formatPoints(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return Number(value.toFixed(2)).toString();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
