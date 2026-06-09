(function () {
  function sendCanvasEnv() {
    try {
      const env = window.ENV || null;

      if (!env || !Array.isArray(env.assignment_groups) || !Array.isArray(env.submissions)) {
        window.postMessage({
          source: "CGC_PAGE_READER",
          ok: false,
          error: "Canvas ENV grade data was not found on this page."
        }, "*");
        return;
      }

      window.postMessage({
        source: "CGC_PAGE_READER",
        ok: true,
        env: {
          course_id: env.course_id,
          assignment_groups: env.assignment_groups,
          submissions: env.submissions,
          group_weighting_scheme: env.group_weighting_scheme,
          hide_final_grades: env.hide_final_grades
        }
      }, "*");
    } catch (error) {
      window.postMessage({
        source: "CGC_PAGE_READER",
        ok: false,
        error: String(error && error.message ? error.message : error)
      }, "*");
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "CGC_CONTENT" || event.data.type !== "REQUEST_CANVAS_ENV") return;
    sendCanvasEnv();
  });

  sendCanvasEnv();
})();
