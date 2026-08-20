import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { checkOllamaHealth } from '../services/ollama';
import { getCourses } from '../services/storage';
import { Course, RootStackParamList } from '../types';
import { DIFFICULTY_LABELS } from '../constants';
import { colors, spacing } from '../theme';
import { Badge } from '../components/UI';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function CourseCard({ course, onPress }: { course: Course; onPress: () => void }) {
  const completed = course.lessons.filter((l) => l.completed).length;
  const total = course.lessons.length;
  const progress = total > 0 ? completed / total : 0;

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>{course.title}</Text>
        <Badge label={DIFFICULTY_LABELS[course.difficulty]} color={colors.accent} />
      </View>
      <Text style={styles.cardDescription} numberOfLines={2}>{course.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>{total} lessons</Text>
        <Text style={styles.cardMeta}>{completed}/{total} completed</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{ ok: boolean; error?: string }>({ ok: false });

  const load = useCallback(async () => {
    const [loaded, health] = await Promise.all([getCourses(), checkOllamaHealth()]);
    setCourses(loaded);
    setOllamaStatus(health);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1e1b4b', colors.background]} style={styles.header}>
        <Text style={styles.appTitle}>CodeCourses</Text>
        <Text style={styles.appSubtitle}>AI-powered programming courses</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: ollamaStatus.ok ? colors.success : colors.error }]} />
          <Text style={styles.statusText}>
            Ollama {ollamaStatus.ok ? 'connected' : 'offline'}
            {ollamaStatus.error ? ` — ${ollamaStatus.error}` : ''}
          </Text>
        </View>
      </LinearGradient>

      <FlatList
        data={courses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <Pressable
            style={styles.createButton}
            onPress={() => navigation.navigate('CreateCourse')}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.createGradient}
            >
              <Text style={styles.createIcon}>+</Text>
              <View>
                <Text style={styles.createTitle}>Create New Course</Text>
                <Text style={styles.createSubtitle}>Generate with Ollama AI</Text>
              </View>
            </LinearGradient>
          </Pressable>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No courses yet</Text>
            <Text style={styles.emptyText}>
              Tap "Create New Course" to generate a programming course powered by Ollama.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <CourseCard
            course={item}
            onPress={() => navigation.navigate('CourseDetail', { courseId: item.id })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
  },
  appSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  createButton: {
    marginBottom: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
  },
  createGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  createIcon: {
    fontSize: 32,
    color: colors.text,
    fontWeight: '300',
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  createSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
});
