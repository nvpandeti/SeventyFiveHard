# SeventyFiveHard - Copilot Instructions

## Project Overview
SeventyFiveHard is a React Native mobile app built with Expo and TypeScript that helps a group of friends track their progress through the 75 Hard mental toughness challenge together.

## Tech Stack
- **Framework**: Expo (React Native)
- **Language**: TypeScript
- **Navigation**: React Navigation (bottom tabs + native stack)
- **State/Storage**: React Context + AsyncStorage (local persistence)
- **UI**: React Native core components with custom styled components

## The 75 Hard Rules (tracked daily)
1. Follow a diet (no cheat meals, no alcohol)
2. Two 45-minute workouts (one must be outdoors)
3. Drink 1 gallon (3.78L) of water
4. Read 10 pages of a non-fiction / self-improvement book
5. Take a progress photo

Missing any task on any day = restart from Day 1.

## Project Structure
- `App.tsx` - Root component with navigation and providers
- `src/screens/` - Screen components (Home, Today, Friends, Profile)
- `src/components/` - Reusable UI components (TaskCheckItem, DayCard, etc.)
- `src/context/` - React Context providers (ChallengeContext)
- `src/storage/` - AsyncStorage helpers
- `src/types/` - TypeScript type definitions
- `src/theme/` - Colors, spacing, typography constants

## Coding Conventions
- Use functional components with hooks
- Prefer typed props via `interface`
- Keep screens thin; extract logic into hooks/context
- Use `StyleSheet.create` for styles, colocated with components
- Import from `src/` using relative paths (no path aliases configured)

## Development Workflow
- Start dev server: `npm start` (Expo)
- Run on Android: `npm run android`
- Run on iOS: `npm run ios`
- Run in web browser: `npm run web`

## Notes
- Friends/social features currently use mock local data; a backend can be added later.
- Data persists locally with AsyncStorage.
