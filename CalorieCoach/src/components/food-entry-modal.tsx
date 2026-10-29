import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FoodLogItem, ManualFoodDraft } from '@/domain/food-log';
import type { Meal, ServingUnit } from '@/domain/models';
import { convertServingQuantity } from '@/domain/nutrition';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

interface FoodEntryModalProps {
  visible: boolean;
  selectedDate: string;
  meals: Meal[];
  item?: FoodLogItem | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: ManualFoodDraft) => void;
}

const SERVING_UNITS: readonly ServingUnit[] = ['serving', 'g', 'oz', 'ml'];

function draftFromItem(item: FoodLogItem): ManualFoodDraft {
  const nutrientAmount = (nutrient: 'energy' | 'protein' | 'carbohydrate' | 'fat') =>
    String(item.food.nutrients.find((amount) => amount.nutrient === nutrient)?.quantity ?? '');
  return {
    name: item.food.name,
    servingAmount: String(item.food.nutritionBasis.quantity),
    servingUnit: item.food.nutritionBasis.unit,
    consumedAmount: String(
      convertServingQuantity(
        item.entry.consumedQuantity,
        item.entry.consumedUnit,
        item.food.nutritionBasis.unit,
      ),
    ),
    caloriesKcal: nutrientAmount('energy'),
    proteinG: nutrientAmount('protein'),
    carbohydrateG: nutrientAmount('carbohydrate'),
    fatG: nutrientAmount('fat'),
    mealId: item.entry.mealId,
  };
}

function emptyDraft(meals: Meal[]): ManualFoodDraft {
  return {
    name: '',
    servingAmount: '1',
    servingUnit: 'serving',
    consumedAmount: '1',
    caloriesKcal: '',
    proteinG: '',
    carbohydrateG: '',
    fatG: '',
    mealId: meals[0]?.id ?? '',
  };
}

export function FoodEntryModal({
  visible,
  selectedDate,
  meals,
  item,
  saving,
  error,
  onClose,
  onSubmit,
}: FoodEntryModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ManualFoodDraft>(() =>
    item ? draftFromItem(item) : emptyDraft(meals),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function update<K extends keyof ManualFoodDraft>(key: K, value: ManualFoodDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  }

  function submit() {
    if (!draft.name.trim()) {
      setValidationError('Enter a food name.');
      return;
    }
    if (!draft.mealId) {
      setValidationError('Choose a meal.');
      return;
    }
    const requiredNumbers: [string, string][] = [
      ['Serving amount', draft.servingAmount],
      ['Amount eaten', draft.consumedAmount],
      ['Calories', draft.caloriesKcal],
      ['Protein', draft.proteinG],
      ['Carbohydrates', draft.carbohydrateG],
      ['Fat', draft.fatG],
    ];
    for (const [label, value] of requiredNumbers) {
      const trimmed = value.trim();
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed) || !Number.isFinite(Number(trimmed))) {
        setValidationError(`${label} must be a valid decimal number.`);
        return;
      }
      const amount = Number(trimmed);
      if (label === 'Calories' || label === 'Protein' || label === 'Carbohydrates' || label === 'Fat') {
        if (amount < 0) {
          setValidationError(`${label} cannot be negative.`);
          return;
        }
      } else if (amount <= 0) {
        setValidationError(`${label} must be greater than zero.`);
        return;
      }
    }
    onSubmit(draft);
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.modal, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, paddingTop: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={onClose}
            style={styles.headerButton}>
            <ThemedText themeColor="accent">Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{item ? 'Edit food' : 'Add food'}</ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={submit}
            style={styles.headerButton}>
            <ThemedText themeColor="accent">{saving ? 'Saving...' : 'Save'}</ThemedText>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: Math.max(insets.bottom, 24) }]}
          keyboardShouldPersistTaps="handled">
          <ThemedText themeColor="textSecondary">{selectedDate}</ThemedText>
          <Field
            label="Food name"
            value={draft.name}
            onChangeText={(value) => update('name', value)}
            placeholder="e.g. Greek yogurt"
            editable={!saving}
            autoCapitalize="words"
            maxLength={100}
          />

          <View style={styles.section}>
            <ThemedText type="smallBold">Serving information</ThemedText>
            <ThemedText themeColor="textSecondary">
              Enter nutrients for this serving, then the amount you ate.
            </ThemedText>
            <Field
              label="Serving amount"
              value={draft.servingAmount}
              onChangeText={(value) => update('servingAmount', value)}
              keyboardType="decimal-pad"
              placeholder="1"
              editable={!saving}
            />
            <View style={styles.choices}>
              {SERVING_UNITS.map((unit) => (
                <Choice
                  key={unit}
                  label={unit}
                  selected={draft.servingUnit === unit}
                  disabled={saving}
                  onPress={() => update('servingUnit', unit)}
                />
              ))}
            </View>
            <Field
              label={`Amount eaten (${draft.servingUnit})`}
              value={draft.consumedAmount}
              onChangeText={(value) => update('consumedAmount', value)}
              keyboardType="decimal-pad"
              placeholder={draft.servingAmount}
              editable={!saving}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">
              Nutrition per {draft.servingAmount || 'serving'} {draft.servingUnit}
            </ThemedText>
            <Field
              label="Calories (kcal)"
              value={draft.caloriesKcal}
              onChangeText={(value) => update('caloriesKcal', value)}
              keyboardType="decimal-pad"
              placeholder="0"
              editable={!saving}
            />
            <Field
              label="Protein (g)"
              value={draft.proteinG}
              onChangeText={(value) => update('proteinG', value)}
              keyboardType="decimal-pad"
              placeholder="0"
              editable={!saving}
            />
            <Field
              label="Carbohydrates (g)"
              value={draft.carbohydrateG}
              onChangeText={(value) => update('carbohydrateG', value)}
              keyboardType="decimal-pad"
              placeholder="0"
              editable={!saving}
            />
            <Field
              label="Fat (g)"
              value={draft.fatG}
              onChangeText={(value) => update('fatG', value)}
              keyboardType="decimal-pad"
              placeholder="0"
              editable={!saving}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Meal</ThemedText>
            <View style={styles.choices}>
              {meals.map((meal) => (
                <Choice
                  key={meal.id}
                  label={meal.name}
                  selected={draft.mealId === meal.id}
                  disabled={saving}
                  onPress={() => update('mealId', meal.id)}
                />
              ))}
            </View>
          </View>

          {(validationError || error) && (
            <ThemedText accessibilityRole="alert" style={styles.error}>
              {validationError ?? error}
            </ThemedText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  ...inputProps
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
} & React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        onChangeText={onChangeText}
        value={value}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
        ]}
        {...inputProps}
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}>
      <ThemedText type={selected ? 'smallBold' : 'small'}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  header: {
    minHeight: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: { minWidth: 56, minHeight: 44, justifyContent: 'center' },
  form: { padding: 20, gap: 20 },
  section: { gap: 12 },
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: '#B42318' },
});
