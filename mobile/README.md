# CodeCourses Mobile

AI-powered programming course generator using Ollama.

## Features

- Generate full programming courses from any topic (Python, React, Rust, etc.)
- Choose difficulty level and number of lessons
- Each lesson includes detailed content and code examples
- Track lesson completion progress
- Courses stored locally on device
- Regenerate individual lesson content

## Ollama Backend

The app connects to Ollama at `http://76.13.0.123:32771` using the `llama2:latest` model.

## Run

```bash
cd mobile
npm install
npm start
```

Then scan the QR code with Expo Go on your phone, or press `w` for web.

### Android / iOS

```bash
npm run android   # requires Android emulator or device
npm run ios       # requires macOS + Xcode
npm run web       # runs in browser
```

## Configuration

Edit `src/constants.ts` to change the Ollama URL or default model:

```ts
export const OLLAMA_BASE_URL = 'http://76.13.0.123:32771';
export const DEFAULT_MODEL = 'llama2:latest';
```

## How It Works

1. User picks a topic, difficulty, and lesson count
2. App calls Ollama `/api/chat` to generate a course outline (JSON)
3. For each lesson, Ollama writes detailed content and a code example
4. Courses are saved locally with AsyncStorage
5. Users read lessons, mark them complete, and track progress
