export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  content: string;
  codeExample?: string;
  completed?: boolean;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  topic: string;
  difficulty: Difficulty;
  lessons: Lesson[];
  createdAt: string;
  model: string;
}

export type RootStackParamList = {
  Home: undefined;
  CreateCourse: undefined;
  CourseDetail: { courseId: string };
  Lesson: { courseId: string; lessonId: string };
};
