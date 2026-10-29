import { useMemo, useRef, useState, type ComponentProps } from 'react';
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

import type { Food, Meal } from '@/domain/models';
import {
  calculateFoodNutrition,
  convertServingQuantity,
} from '@/domain/nutrition';
import {
  UsdaFoodDataCentralProvider,
} from '@/services/usda-food-data-central';
import type {
  FoodSearchMatch,
  NutritionFoodDetails,
} from '@/services/usda-food-data-central';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

interface FoodSearchModalProps {
  visible: boolean;
  selectedDate: string;
  meals: Meal[];
  savedFoods: Food[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onDismiss: () => void;
  onSave: (selection: FoodSearchSelection, amount: number, mealId: string) => void;
}

export type FoodSearchSelection =
  | { kind: 'provider'; details: NutritionFoodDetails }
  | { kind: 'saved'; food: Food };

function getFood(selection: FoodSearchSelection): Food {
  return selection.kind === 'provider' ? selection.details.food : selection.food;
}

function referenceAmount(food: Food): number | null {
  try {
    return convertServingQuantity(
      food.servingSize.quantity,
      food.servingSize.unit,
      food.nutritionBasis.unit,
    );
  } catch {
    return null;
  }
}

function savedFoodKey(food: Food): string {
  return JSON.stringify([
    food.name.trim().toLowerCase(),
    food.brand?.trim().toLowerCase() ?? null,
    food.servingSize,
    food.nutritionBasis,
    food.nutrients
      .map((nutrient) => [nutrient.nutrient, nutrient.quantity])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
    food.source,
    food.sourceDetails,
  ]);
}

function isPositiveDecimal(value: string): boolean {
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 0;
}

function formatAmount(value: number | undefined, unit: 'kcal' | 'g' | 'mg'): string {
  return value === undefined
    ? 'Unknown'
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function FoodSearchModal({
  visible,
  selectedDate,
  meals,
  savedFoods,
  saving,
  error: saveError,
  onClose,
  onDismiss,
  onSave,
}: FoodSearchModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const provider = useMemo(() => new UsdaFoodDataCentralProvider(undefined), []);
  const requestId = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchMatch[]>([]);
  const [review, setReview] = useState<FoodSearchSelection | null>(null);
  const [amount, setAmount] = useState('');
  const [mealId, setMealId] = useState(meals[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const savedFoodsByKey = new Map<string, Food>();
  for (const food of savedFoods) {
    const key = savedFoodKey(food);
    if (!savedFoodsByKey.has(key)) savedFoodsByKey.set(key, food);
  }
  const distinctSavedFoods = [...savedFoodsByKey.values()];
  const matchingSavedFoods = distinctSavedFoods
    .filter((food) =>
      `${food.name} ${food.brand ?? ''} ${food.sourceDetails ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery),
    )
    .slice(0, 25);

  async function search() {
    const currentRequest = ++requestId.current;
    setReview(null);
    setResults([]);
    setSearched(false);
    setLocalError(null);
    setLoading(true);
    try {
      const matches = await provider.searchFoods(query);
      if (currentRequest === requestId.current) {
        setResults(matches);
        setSearched(true);
      }
    } catch (searchError) {
      if (currentRequest === requestId.current) {
        setLocalError(
          searchError instanceof Error ? searchError.message : 'Food search could not be completed.',
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  async function selectResult(match: FoodSearchMatch) {
    const currentRequest = ++requestId.current;
    setReview(null);
    setLocalError(null);
    setLoading(true);
    try {
      const selectedDetails = await provider.getFoodDetails(match.fdcId);
      if (currentRequest === requestId.current) {
        setReview({ kind: 'provider', details: selectedDetails });
        setAmount(String(
          referenceAmount(selectedDetails.food) ??
          selectedDetails.food.nutritionBasis.quantity,
        ));
        setMealId((current) => current || meals[0]?.id || '');
      }
    } catch (detailError) {
      if (currentRequest === requestId.current) {
        setLocalError(
          detailError instanceof Error ? detailError.message : 'Food details could not be loaded.',
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  function close() {
    requestId.current += 1;
    onClose();
  }

  function selectSavedFood(food: Food) {
    setLocalError(null);
    setReview({ kind: 'saved', food });
    setAmount(String(referenceAmount(food) ?? food.nutritionBasis.quantity));
    setMealId((current) => current || meals[0]?.id || '');
  }

  const reviewFood = review ? getFood(review) : null;
  const amountValue = isPositiveDecimal(amount) ? Number(amount) : null;
  const nutrition =
    reviewFood && amountValue !== null
      ? calculateFoodNutrition(reviewFood, amountValue, reviewFood.nutritionBasis.unit).nutrients
      : null;
  const servingAmount = reviewFood ? referenceAmount(reviewFood) : null;

  return (
    <Modal
      animationType="slide"
      onDismiss={onDismiss}
      onRequestClose={close}
      presentationStyle="pageSheet"
      visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.modal, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" onPress={review ? () => {
            requestId.current += 1;
            setReview(null);
            setLocalError(null);
          } : close} style={styles.headerButton}>
            <ThemedText themeColor="accent">{review ? 'Results' : 'Cancel'}</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{review ? 'Review food' : 'Food search'}</ThemedText>
          {review ? (
            <Pressable
              accessibilityRole="button"
              disabled={
                saving ||
                loading ||
                !isPositiveDecimal(amount) ||
                !mealId ||
                !reviewFood?.nutrients.some((nutrient) =>
                  ['energy', 'protein', 'carbohydrate', 'fat'].includes(nutrient.nutrient),
                )
              }
              onPress={() => {
                if (!review || !isPositiveDecimal(amount)) return;
                onSave(review, Number(amount), mealId);
              }}
              style={styles.headerButton}>
              <ThemedText themeColor="accent">{saving ? 'Saving...' : 'Add'}</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>

        {review && reviewFood ? (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
            keyboardShouldPersistTaps="handled">
            <ThemedText themeColor="textSecondary">{selectedDate}</ThemedText>
            <ThemedText type="subtitle">{reviewFood.name}</ThemedText>
            {reviewFood.brand && (
              <ThemedText themeColor="textSecondary">{reviewFood.brand}</ThemedText>
            )}
            <ThemedText themeColor="textSecondary">
              {review.kind === 'provider'
                ? `USDA FoodData Central · ${review.details.dataType} · FDC ID ${review.details.fdcId}`
                : `Saved food · ${reviewFood.sourceDetails ?? reviewFood.source}`}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Reference serving: {review.kind === 'provider'
                ? review.details.referenceServing ?? `${reviewFood.servingSize.quantity} ${reviewFood.servingSize.unit}`
                : `${reviewFood.servingSize.quantity} ${reviewFood.servingSize.unit}`}
            </ThemedText>
            {servingAmount !== null && servingAmount !== amountValue && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAmount(String(servingAmount))}
                style={[styles.referenceButton, { borderColor: theme.border }]}>
                <ThemedText themeColor="accent">
                  Use reference serving ({servingAmount} {reviewFood.nutritionBasis.unit})
                </ThemedText>
              </Pressable>
            )}
            <ThemedText themeColor="textSecondary">
              Nutrition basis: per {reviewFood.nutritionBasis.quantity} {reviewFood.nutritionBasis.unit}. Enter the amount eaten in{' '}
              {reviewFood.nutritionBasis.unit}; other units are not inferred.
            </ThemedText>

            <Field
              label={`Amount eaten (${reviewFood.nutritionBasis.unit})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={String(reviewFood.nutritionBasis.quantity)}
            />
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="smallBold">Nutrition for this amount</ThemedText>
              <NutritionRow label="Calories" value={nutrition?.energy?.quantity} unit="kcal" />
              <NutritionRow label="Protein" value={nutrition?.protein?.quantity} unit="g" />
              <NutritionRow label="Carbohydrates" value={nutrition?.carbohydrate?.quantity} unit="g" />
              <NutritionRow label="Fat" value={nutrition?.fat?.quantity} unit="g" />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {review.kind === 'provider' && review.details.dataType === 'Branded'
                ? 'USDA data is shown as supplied. Branded values may be based on manufacturer-provided label data and can reflect label rounding.'
                : 'Nutrition values are shown using their saved source and serving basis.'}
            </ThemedText>
            {!reviewFood.nutrients.some((nutrient) =>
              ['energy', 'protein', 'carbohydrate', 'fat'].includes(nutrient.nutrient),
            ) && (
              <ThemedText accessibilityRole="alert" style={styles.error}>
                This result has no calorie or macro values. Choose another food or use manual entry.
              </ThemedText>
            )}

            <View style={styles.section}>
              <ThemedText type="smallBold">Meal</ThemedText>
              <View style={styles.choices}>
                {meals.map((meal) => (
                  <Choice
                    key={meal.id}
                    label={meal.name}
                    selected={mealId === meal.id}
                    onPress={() => setMealId(meal.id)}
                  />
                ))}
              </View>
            </View>
            {(localError || saveError) && (
              <ThemedText accessibilityRole="alert" style={styles.error}>
                {localError ?? saveError}
              </ThemedText>
            )}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
            keyboardShouldPersistTaps="handled">
            <ThemedText themeColor="textSecondary">
              Search USDA FoodData Central. Live search is disabled until an approved server-side proxy is configured. Results are limited to the first 25 matches.
            </ThemedText>
            <Field
              label="Food name"
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. strawberries"
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => void search()}
            />
            <Pressable
              accessibilityRole="button"
              disabled={loading || !query.trim()}
              onPress={() => void search()}
              style={[
                styles.searchButton,
                { backgroundColor: theme.accent, opacity: loading || !query.trim() ? 0.6 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.backgroundElement }}>
                {loading ? 'Searching...' : 'Search'}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">
              Provider: USDA FoodData Central. Only the food search text and selected food ID are sent through the approved proxy; your log and other health data remain local. Branded values can be manufacturer-provided and label-rounded.
            </ThemedText>
            {loading && (
              <ThemedText accessibilityRole="progressbar" themeColor="textSecondary">
                Loading results...
              </ThemedText>
            )}
            {localError && (
              <ThemedText accessibilityRole="alert" style={styles.error}>{localError}</ThemedText>
            )}
            {searched && results.length === 0 && !loading && !localError && (
              <ThemedText themeColor="textSecondary">No matching foods found. Try another search or use manual entry.</ThemedText>
            )}
            {results.map((result) => (
              <Pressable
                key={result.fdcId}
                accessibilityRole="button"
                disabled={loading}
                onPress={() => void selectResult(result)}
                style={[styles.result, { borderColor: theme.border }]}>
                <View style={styles.resultText}>
                  <ThemedText type="smallBold">{result.description}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[result.brandOwner, result.dataType, `FDC ${result.fdcId}`].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <ThemedText themeColor="accent">Select</ThemedText>
              </Pressable>
            ))}
            <View style={styles.section}>
              <ThemedText type="smallBold">Saved foods (offline)</ThemedText>
              {matchingSavedFoods.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  {savedFoods.length === 0
                    ? 'Foods you enter manually or save from a provider will be available here for reuse.'
                    : 'No saved foods match this search.'}
                </ThemedText>
              ) : (
                matchingSavedFoods.map((food) => (
                  <Pressable
                    key={food.id}
                    accessibilityRole="button"
                    disabled={loading}
                    onPress={() => selectSavedFood(food)}
                    style={[styles.result, { borderColor: theme.border }]}>
                    <View style={styles.resultText}>
                      <ThemedText type="smallBold">{food.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[food.brand, food.sourceDetails ?? food.source].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                    <ThemedText themeColor="accent">Select</ThemedText>
                  </Pressable>
                ))
              )}
            </View>
          </ScrollView>
        )}
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
} & ComponentProps<typeof TextInput>) {
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

function NutritionRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | undefined;
  unit: 'kcal' | 'g';
}) {
  return (
    <View style={styles.nutritionRow}>
      <ThemedText>{label}</ThemedText>
      <ThemedText themeColor="textSecondary">{formatAmount(value, unit)}</ThemedText>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
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
  headerButton: { minWidth: 56, minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' },
  content: { padding: 20, gap: 16 },
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  searchButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  result: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  resultText: { flex: 1, gap: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  section: { gap: 10 },
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
