import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { generateLessonContent } from '../services/ollama';
import { getCourse, markLessonComplete, saveCourse } from '../services/storage';
import { Course, Lesson, RootStackParamList } from '../types';
import { colors, spacing } from '../theme';
import { Button, LoadingOverlay } from '../components/UI';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Lesson'>;
type Route = RouteProp<RootStackParamList, 'Lesson'>;

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      elements.push(
        <Text key={i} style={styles.h2}>{line.slice(3)}</Text>,
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <Text key={i} style={styles.h1}>{line.slice(2)}</Text>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <Text key={i} style={styles.bullet}>• {line.slice(2)}</Text>,
      );
    } else if (line.trim() === '') {
      elements.push(<View key={i} style={styles.spacer} />);
    } else {
      elements.push(
        <Text key={i} style={styles.paragraph}>{line}</Text>,
      );
    }
  });

  return elements;
}

export function LessonScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [course, setCourse] = useState<Course | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  const load = useCallback(async () => {
    const loaded = await getCourse(route.params.courseId);
    if (!loaded) return;
    setCourse(loaded);
    const found = loaded.lessons.find((l) => l.id === route.params.lessonId);
    setLesson(found ?? null);
  }, [route.params.courseId, route.params.lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async () => {
    const updated = await markLessonComplete(route.params.courseId, route.params.lessonId);
    if (updated) {
      setCourse(updated);
      const found = updated.lessons.find((l) => l.id === route.params.lessonId);
      setLesson(found ?? null);
    }
  };

  const handleRegenerate = async () => {
    if (!course || !lesson) return;

    setRegenerating(true);
    setProgressMessage('Regenerating lesson content...');

    try {
      const content = await generateLessonContent(
        course.title,
        course.topic,
        course.difficulty,
        lesson,
        course.model,
      );

      const updatedLesson: Lesson = {
        ...lesson,
        content: content.content,
        codeExample: content.codeExample,
      };

      const updatedCourse: Course = {
        ...course,
        lessons: course.lessons.map((l) =>
          l.id === lesson.id ? updatedLesson : l,
        ),
      };

      await saveCourse(updatedCourse);
      setCourse(updatedCourse);
      setLesson(updatedLesson);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Regeneration failed';
      Alert.alert('Error', message);
    } finally {
      setRegenerating(false);
    }
  };

  const goToNext = () => {
    if (!course || !lesson) return;
    const index = course.lessons.findIndex((l) => l.id === lesson.id);
    if (index < course.lessons.length - 1) {
      navigation.replace('Lesson', {
        courseId: course.id,
        lessonId: course.lessons[index + 1].id,
      });
    }
  };

  if (!lesson || !course) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Lesson not found</Text>
      </View>
    );
  }

  const lessonIndex = course.lessons.findIndex((l) => l.id === lesson.id);
  const hasNext = lessonIndex < course.lessons.length - 1;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lessonLabel}>
          Lesson {lessonIndex + 1} of {course.lessons.length}
        </Text>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.summary}>{lesson.summary}</Text>

        <View style={styles.content}>
          {renderMarkdown(lesson.content)}
        </View>

        {lesson.codeExample && (
          <View style={styles.codeBlock}>
            <Text style={styles.codeLabel}>Code Example</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={styles.code}>{lesson.codeExample}</Text>
            </ScrollView>
          </View>
        )}

        <View style={styles.actions}>
          {!lesson.completed && (
            <Button title="Mark Complete" onPress={handleComplete} />
          )}
          {lesson.completed && hasNext && (
            <Button title="Next Lesson" onPress={goToNext} />
          )}
          <Button
            title="Regenerate Content"
            onPress={handleRegenerate}
            variant="secondary"
            loading={regenerating}
            disabled={regenerating}
          />
        </View>
      </ScrollView>

      {regenerating && <LoadingOverlay message={progressMessage} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  muted: {
    color: colors.textMuted,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  lessonLabel: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  summary: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    gap: spacing.sm,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  h2: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  paragraph: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 26,
  },
  bullet: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 26,
    paddingLeft: spacing.sm,
  },
  spacer: {
    height: spacing.sm,
  },
  codeBlock: {
    backgroundColor: '#0d1117',
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeLabel: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#e6edf3',
    lineHeight: 20,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
});
