import AsyncStorage from '@react-native-async-storage/async-storage';
import { Course } from '../types';

const COURSES_KEY = '@codecourses:courses';

export async function getCourses(): Promise<Course[]> {
  const raw = await AsyncStorage.getItem(COURSES_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Course[];
}

export async function saveCourse(course: Course): Promise<void> {
  const courses = await getCourses();
  const index = courses.findIndex((c) => c.id === course.id);
  if (index >= 0) {
    courses[index] = course;
  } else {
    courses.unshift(course);
  }
  await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

export async function getCourse(id: string): Promise<Course | null> {
  const courses = await getCourses();
  return courses.find((c) => c.id === id) ?? null;
}

export async function deleteCourse(id: string): Promise<void> {
  const courses = await getCourses();
  await AsyncStorage.setItem(
    COURSES_KEY,
    JSON.stringify(courses.filter((c) => c.id !== id)),
  );
}

export async function markLessonComplete(
  courseId: string,
  lessonId: string,
): Promise<Course | null> {
  const course = await getCourse(courseId);
  if (!course) return null;

  const updated: Course = {
    ...course,
    lessons: course.lessons.map((lesson) =>
      lesson.id === lessonId ? { ...lesson, completed: true } : lesson,
    ),
  };

  await saveCourse(updated);
  return updated;
}
