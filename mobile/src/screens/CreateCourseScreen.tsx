import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { generateFullCourse } from '../services/ollama';
import { saveCourse } from '../services/storage';
import { Difficulty, RootStackParamList } from '../types';
import { TOPIC_SUGGESTIONS } from '../constants';
import { colors, spacing } from '../theme';
import { Button, LoadingOverlay } from '../components/UI';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CreateCourse'>;

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const LESSON_COUNTS = [3, 5, 7, 10];

export function CreateCourseScreen() {
  const navigation = useNavigation<Nav>();
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [lessonCount, setLessonCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const handleGenerate = async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      Alert.alert('Topic required', 'Enter a programming topic for your course.');
      return;
    }

    setLoading(true);
    setProgress(0);
    setProgressMessage('Connecting to Ollama...');

    try {
      const course = await generateFullCourse(
        trimmed,
        difficulty,
        lessonCount,
        (message, p) => {
          setProgressMessage(message);
          setProgress(p);
        },
      );

      await saveCourse(course);
      navigation.replace('CourseDetail', { courseId: course.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate course';
      Alert.alert(
        'Generation failed',
        `${message}\n\nMake sure Ollama is running at the configured URL and has enough memory.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>What do you want to learn?</Text>
        <Text style={styles.subheading}>
          Ollama will generate a full course with lessons and code examples.
        </Text>

        <Text style={styles.label}>Topic</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Python, React, Rust..."
          placeholderTextColor={colors.textMuted}
          value={topic}
          onChangeText={setTopic}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.suggestionsLabel}>Suggestions</Text>
        <View style={styles.chips}>
          {TOPIC_SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, topic === s && styles.chipActive]}
              onPress={() => setTopic(s)}
            >
              <Text style={[styles.chipText, topic === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.row}>
          {DIFFICULTIES.map((d) => (
            <Pressable
              key={d}
              style={[styles.option, difficulty === d && styles.optionActive]}
              onPress={() => setDifficulty(d)}
            >
              <Text style={[styles.optionText, difficulty === d && styles.optionTextActive]}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Number of lessons</Text>
        <View style={styles.row}>
          {LESSON_COUNTS.map((n) => (
            <Pressable
              key={n}
              style={[styles.option, lessonCount === n && styles.optionActive]}
              onPress={() => setLessonCount(n)}
            >
              <Text style={[styles.optionText, lessonCount === n && styles.optionTextActive]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button
          title="Generate Course"
          onPress={handleGenerate}
          loading={loading}
          disabled={loading}
          style={styles.generateButton}
        />

        <Text style={styles.note}>
          Generation may take several minutes depending on Ollama server load. Each lesson is
          written individually for quality.
        </Text>
      </ScrollView>

      {loading && <LoadingOverlay message={progressMessage} progress={progress} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subheading: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionsLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary + '33',
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  optionActive: {
    backgroundColor: colors.primary + '33',
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  optionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  generateButton: {
    marginTop: spacing.xl,
  },
  note: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
