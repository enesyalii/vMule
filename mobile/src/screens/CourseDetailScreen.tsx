import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { deleteCourse, getCourse } from '../services/storage';
import { Course, Lesson, RootStackParamList } from '../types';
import { DIFFICULTY_LABELS } from '../constants';
import { colors, spacing } from '../theme';
import { Badge } from '../components/UI';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CourseDetail'>;
type Route = RouteProp<RootStackParamList, 'CourseDetail'>;

function LessonRow({
  lesson,
  index,
  onPress,
}: {
  lesson: Lesson;
  index: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.lessonRow}>
      <View style={[styles.lessonNumber, lesson.completed && styles.lessonNumberDone]}>
        <Text style={styles.lessonNumberText}>
          {lesson.completed ? '✓' : index + 1}
        </Text>
      </View>
      <View style={styles.lessonInfo}>
        <Text style={styles.lessonTitle}>{lesson.title}</Text>
        <Text style={styles.lessonSummary} numberOfLines={1}>{lesson.summary}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function CourseDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [course, setCourse] = useState<Course | null>(null);

  const load = useCallback(async () => {
    const loaded = await getCourse(route.params.courseId);
    setCourse(loaded);
  }, [route.params.courseId]);

  useEffect(() => {
    load();
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [load, navigation]);

  const handleDelete = () => {
    Alert.alert('Delete course', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCourse(route.params.courseId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!course) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Course not found</Text>
      </View>
    );
  }

  const completed = course.lessons.filter((l) => l.completed).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badges}>
          <Badge label={DIFFICULTY_LABELS[course.difficulty]} color={colors.accent} />
          <Badge label={course.topic} color={colors.primary} />
        </View>
        <Text style={styles.title}>{course.title}</Text>
        <Text style={styles.description}>{course.description}</Text>
        <Text style={styles.progress}>
          {completed} of {course.lessons.length} lessons completed
        </Text>
      </View>

      <FlatList
        data={course.lessons}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.sectionTitle}>Lessons</Text>}
        renderItem={({ item, index }) => (
          <LessonRow
            lesson={item}
            index={index}
            onPress={() =>
              navigation.navigate('Lesson', {
                courseId: course.id,
                lessonId: item.id,
              })
            }
          />
        )}
        ListFooterComponent={
          <Pressable onPress={handleDelete} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Delete Course</Text>
          </Pressable>
        }
      />
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
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  progress: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  list: {
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lessonNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lessonNumberDone: {
    backgroundColor: colors.success + '33',
  },
  lessonInfo: {
    flex: 1,
  },
  lessonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  lessonSummary: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  lessonNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  chevron: {
    fontSize: 22,
    color: colors.textMuted,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  deleteText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '500',
  },
});
