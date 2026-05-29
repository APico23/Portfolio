# Dinner Menu Planner (Local)

A dependency-free local web app for planning dinners with weighted scheduling.

## Run

1. Open `planner.html` in your browser.
2. Data is saved automatically in browser local storage.

## Features

- Eater profiles with disliked-food lists.
- Two app views: Data Entry and Calendar.
- Data Entry actions: Save JSON, Load JSON, Seed Demo Data, Clear All Data.
- Calendar actions: Save JSON, Load JSON, Clear Calendar.
- Recipe entry with potential disliked-food tags, complexity score (1-10), and full recipe text and/or reference link/source.
- Meal reviews from 1-100.
- Average rating calculated from all ratings per recipe.
- Calendar generation by number of days or months.
- Generated plans append over time and auto-advance the next Start Date to the next unplanned day.
- Click day to view details: recipe info, average rating, disliked-food tags.
- Regenerate a single day without counting replaced meal as eaten.
- Save/Load JSON backups include all app data (profiles, recipes, ratings, plans, generator settings, cadence, and current view).
- Rolling calendar display window shows at most 3 past days while retaining full history for scoring.

## Planner Rules Implemented

- Hard 14-day repeat lockout for recipes.
- Weighted score factors: recency (longer since last served -> higher chance), average rating (higher -> higher chance), complexity (lower -> higher chance), dislike burden across eater profiles (higher burden -> lower chance), and recent disliked-food exposure penalty.
- New recipe night every 11-17 days (pseudo-random cadence).
- Eat Out / Order In night roughly every 19-24 days (pseudo-random cadence).
- A recipe can only be marked as a "new recipe night" once.
- Weighted-random pick among top candidates to improve variety.

## Data Model (stored in localStorage)

- `profiles`: eater profiles and disliked foods.
- `recipes`: meal ideas and recipe details.
- `ratings`: individual review records.
- `plans`: date keyed generated meal schedule.
- `generator`: last used generation options.
- `cadence`: next new-recipe and eat-out trigger days.
- `currentView`: currently selected app view (`data` or `calendar`).

## Notes

- For best results, add 14+ recipes to avoid lockout conflicts.
- Use Save JSON periodically as a backup.
- The 3-day past window is date-based, not row-based: planned meals older than 3 days are hidden even if they would appear in earlier calendar rows.
- Full historical plan data is still stored and used for recency/last-eaten logic.
