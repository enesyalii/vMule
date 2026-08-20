import { OLLAMA_BASE_URL, DEFAULT_MODEL, REQUEST_TIMEOUT_MS } from '../constants';
import { Course, Difficulty, Lesson } from '../types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message?: { content: string };
  error?: string;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return JSON.parse(text.slice(braceStart, braceEnd + 1));
  }
  throw new Error('No JSON found in model response');
}

async function chat(messages: ChatMessage[], model = DEFAULT_MODEL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.7, num_predict: 2048 },
      }),
      signal: controller.signal,
    });

    const data: OllamaChatResponse = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error ?? `Ollama request failed (${response.status})`);
    }

    const content = data.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from Ollama');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkOllamaHealth(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, models: [], error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: err instanceof Error ? err.message : 'Connection failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateCourseOutline(
  topic: string,
  difficulty: Difficulty,
  lessonCount: number,
  model = DEFAULT_MODEL,
): Promise<{ title: string; description: string; lessons: Omit<Lesson, 'content'>[] }> {
  const prompt = `Create a programming course outline for "${topic}" at ${difficulty} level with exactly ${lessonCount} lessons.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "title": "Course title",
  "description": "2-3 sentence course description",
  "lessons": [
    {
      "id": "lesson-1",
      "title": "Lesson title",
      "summary": "One sentence summary of what this lesson covers"
    }
  ]
}

Make lessons progressive — each builds on the previous. Include practical programming concepts.`;

  const content = await chat(
    [
      {
        role: 'system',
        content: 'You are an expert programming instructor. Always respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    model,
  );

  const parsed = extractJson(content) as {
    title: string;
    description: string;
    lessons: Array<{ id?: string; title: string; summary: string }>;
  };

  const lessons = parsed.lessons.map((lesson, index) => ({
    id: lesson.id ?? `lesson-${index + 1}`,
    title: lesson.title,
    summary: lesson.summary,
  }));

  return {
    title: parsed.title,
    description: parsed.description,
    lessons,
  };
}

export async function generateLessonContent(
  courseTitle: string,
  topic: string,
  difficulty: Difficulty,
  lesson: Omit<Lesson, 'content'>,
  model = DEFAULT_MODEL,
): Promise<{ content: string; codeExample?: string }> {
  const prompt = `Write lesson content for the course "${courseTitle}" about ${topic} (${difficulty} level).

Lesson: "${lesson.title}"
Summary: ${lesson.summary}

Return ONLY valid JSON:
{
  "content": "Detailed lesson content in markdown format (300-500 words). Use ## for headings, explain concepts clearly with examples.",
  "codeExample": "A practical code example for this lesson (optional, use appropriate language for the topic)"
}`;

  const content = await chat(
    [
      {
        role: 'system',
        content:
          'You are an expert programming instructor. Write clear, practical lessons. Respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    model,
  );

  const parsed = extractJson(content) as { content: string; codeExample?: string };
  return {
    content: parsed.content,
    codeExample: parsed.codeExample,
  };
}

export async function generateFullCourse(
  topic: string,
  difficulty: Difficulty,
  lessonCount: number,
  onProgress?: (message: string, progress: number) => void,
  model = DEFAULT_MODEL,
): Promise<Course> {
  onProgress?.('Generating course outline...', 0.1);

  const outline = await generateCourseOutline(topic, difficulty, lessonCount, model);

  const lessons: Lesson[] = [];
  const total = outline.lessons.length;

  for (let i = 0; i < total; i++) {
    const lessonOutline = outline.lessons[i];
    const progress = 0.1 + (0.9 * (i / total));
    onProgress?.(`Writing lesson ${i + 1} of ${total}: ${lessonOutline.title}`, progress);

    const lessonContent = await generateLessonContent(
      outline.title,
      topic,
      difficulty,
      lessonOutline,
      model,
    );

    lessons.push({
      ...lessonOutline,
      content: lessonContent.content,
      codeExample: lessonContent.codeExample,
      completed: false,
    });
  }

  onProgress?.('Course ready!', 1);

  return {
    id: `course-${Date.now()}`,
    title: outline.title,
    description: outline.description,
    topic,
    difficulty,
    lessons,
    createdAt: new Date().toISOString(),
    model,
  };
}
