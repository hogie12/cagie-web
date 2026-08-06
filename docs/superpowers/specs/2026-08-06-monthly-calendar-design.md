# Monthly Calendar View Design

## Overview
Add a monthly calendar view to the existing `/calendar` page. Users can switch between a "Daily" (timeline) view and a "Monthly" (grid) view. The default view will be the "Daily" view to maintain the current user experience, with a toggle to switch to "Monthly".

## Architecture & State
- **State Management**: Add a new state variable `viewMode` (`"daily" | "monthly"`) to `/app/(app)/calendar/page.tsx` initialized to `"daily"`.
- **Data Flow**: The monthly view will utilize the existing `events` fetched from `useCoupleData()`. Since `events` already contains all events for the couple, no new data fetching logic is required.

## Components & Layout

### 1. View Toggle
- A toggle button group (Segmented Control) added to the header next to the "Today" and "+" buttons.
- Options: "Daily" and "Monthly".

### 2. Monthly Grid View
- A 7x5 or 7x6 grid component representing the month layout.
- The grid will display standard days of the week headers (Mon-Sun).
- Current month days will have a white background, while days from previous/next months will be slightly grayed out.
- A "Today" highlight will be applied to the current date's cell.

### 3. Event Previews
- Inside each day's cell, a maximum of 3 events will be displayed.
- Each event will be a small badge with the event title truncated.
- The background color of the badge will correspond to the event owner (me, partner, us) using the existing `colors` object.
- If a day has more than 3 events, a small text indicator (e.g., "+2 more") will be displayed at the bottom of the cell.

### 4. Navigation
- Clicking on any day cell in the Monthly Grid will:
  1. Set `selectedDate` to the clicked day.
  2. Switch `viewMode` to `"daily"`.
- This ensures a smooth transition from a high-level monthly overview to a detailed daily timeline.

## Error Handling & Testing
- Ensuring events are correctly filtered by month and day without overlapping.
- Edge cases: months with 6 weeks to display, handling long event titles (text truncation).

## Open Questions / Ambiguities
None. The design is isolated to the calendar page and uses existing state/context.
