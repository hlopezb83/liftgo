
# Fix: Make forklift name fully visible in Gantt chart

## Problem
The forklift name column in the Gantt chart uses a fixed width of `w-36` (144px) with `truncate`, which cuts off longer names.

## Solution
Widen the label column from `w-36` to `w-48` (192px) across all three places in the component (day-of-week header, day number header, and forklift rows) to ensure full visibility. Also remove the `truncate` class from the forklift name so it never gets clipped.

## Changes

**File: `src/components/calendar/GanttChart.tsx`**
- Line 109: Change `w-36` to `w-48` (day-of-week header spacer)
- Line 130: Change `w-36` to `w-48` (day number header label)
- Line 155: Change `w-36` to `w-48` (forklift row label container)
- Line 157: Remove `truncate` class from the forklift name span so long names wrap or remain fully visible
