# Canvas Grade Calculator

A lightweight Chrome extension that estimates your Canvas grade when the course total is hidden or disabled.

This extension runs locally in your browser and helps students calculate their current grade using Canvas assignment groups, weights, scores, and what-if inputs.

<img width="406" height="834" alt="image" src="https://github.com/user-attachments/assets/d72fd826-7ff9-4eec-85ad-49bc945eddba" />

## Features

- Calculates estimated Canvas grades
- Reads assignment groups and weights from the Canvas Grades page
- Supports what-if scores
- Recalculate button for manual updates
- Works locally in the browser
- Does not collect, store, or upload grade data

## How to Install

1. Download this repository as a ZIP.
2. Extract the ZIP.
3. Open Chrome and go to:

```text
chrome://extensions
```
4. Turn on Developer mode in the top-right corner.
5. Click Load unpacked.
6. Select the extracted extension folder.
7. Open Canvas and go to your course Grades page.

## How to Use

1. Open your Canvas course.
2. Go to the Grades page.
3. The calculator panel should appear.
4. Enter any what-if scores.
5. Click Recalculate Grade.
6. Refresh the Canvas page to clear what-if scores.

## Privacy

This extension does not collect, transmit, sell, or store user data.

All grade calculations happen locally in your browser.

See [PRIVACY.md](https://github.com/VeloxityOW/Canvas-Grade-Calculator-/blob/main/PRIVACY.md) for more details.

## Disclaimer

This is an unofficial tool and is not affiliated with Canvas, Instructure, ASU, or any university.

Calculated grades are estimates only. Always check your official syllabus, grading policy, and instructor announcements for final grade rules.

## Known Limitations

- Only works on Canvas Grades pages where grade data is available in the page.
- Some classes may use special grading rules that are not fully represented.
- Dropped assignments, extra credit, grading periods, and hidden/unposted grades may not always calculate exactly like Canvas.
