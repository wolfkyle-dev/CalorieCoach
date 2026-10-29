import { useReducer, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FoodEntryModal } from '@/components/food-entry-modal';
import { FoodSearchModal } from '@/components/food-search-modal';
import type { FoodSearchSelection } from '@/components/food-search-modal';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import {
  calculateDailyNutritionTotals,
  formatLocalDate,
  getLocalDateString,
  shiftLocalDate,
} from '@/domain/food-log';
import type { FoodLogItem } from '@/domain/food-log';
import {
  transitionFoodEntryFlow,
} from '@/domain/food-entry-flow';
import type { FoodEntryFlowState } from '@/domain/food-entry-flow';
import { calculateFoodNutrition } from '@/domain/nutrition';
import { useFoodLog } from '@/hooks/use-food-log';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    selectedDate,
    setSelectedDate,
    items,
    meals,
    savedFoods,
    loading,
    saving,
    error,
    saveEntry,
    saveProviderFood,
    logSavedFood,
    deleteEntry,
    clearError,
  } = useFoodLog();
  const [foodEntryFlow, dispatchFoodEntryFlow] = useReducer(
    transitionFoodEntryFlow,
    'closed' as FoodEntryFlowState,
  );
  const formVisible = foodEntryFlow === 'entry';
  const entryModalMounted = foodEntryFlow !== 'closed';
  const searchVisible = foodEntryFlow === 'search';
  const searchModalMounted =
    searchVisible || foodEntryFlow === 'dismissing-search-for-entry';
  const [editingItem, setEditingItem] = useState<FoodLogItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<FoodLogItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dayItems = items.filter((item) => item.entry.loggedDate === selectedDate);
  const totals = calculateDailyNutritionTotals(dayItems);
  const today = getLocalDateString();
  const dateTitle = selectedDate === today ? 'Today' : formatLocalDate(selectedDate);
  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
    },
    web: {
      paddingTop: Spacing.four,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <>
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={{
        top: insets.top,
        bottom: insets.bottom + BottomTabInset + Spacing.four,
        left: insets.left,
        right: insets.right,
      }}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <View style={styles.dashboard}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>
              {formatLocalDate(selectedDate)}
            </Text>
            <Text style={[styles.title, { color: theme.text }]}>{dateTitle}</Text>
          </View>
          <View
            accessibilityLabel="CalorieCoach"
            style={[styles.brandMark, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.brandLetter, { color: theme.accent }]}>C</Text>
          </View>
        </View>

        <View
          style={[
            styles.card,
            styles.calorieCard,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <View style={styles.cardHeading}>
            <View>
              <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>
                DAILY CALORIES
              </Text>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Your calorie balance</Text>
            </View>
            <View style={[styles.goalBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.goalBadgeText, { color: theme.accent }]}>Goal not set</Text>
            </View>
          </View>
          <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
            Daily intake from your food log. Set a target to see your remaining calories.
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.balanceRow}>
            <BalanceValue
              label="Consumed"
              value={`${formatAmount(totals.caloriesKcal, 0)} kcal`}
              color={theme.text}
              secondary={theme.textSecondary}
            />
            <View style={[styles.balanceDivider, { backgroundColor: theme.border }]} />
            <BalanceValue
              label="Remaining"
              value="Not available"
              color={theme.text}
              secondary={theme.textSecondary}
            />
          </View>
        </View>

        <View style={styles.dayControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => setSelectedDate((date) => shiftLocalDate(date, -1))}
            style={[styles.dayButton, { borderColor: theme.border }]}>
            <Text style={[styles.dayButtonText, { color: theme.accent }]}>Previous</Text>
          </Pressable>
          {selectedDate !== today && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedDate(today)}
              style={[styles.dayButton, { borderColor: theme.border }]}>
              <Text style={[styles.dayButtonText, { color: theme.accent }]}>Today</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => setSelectedDate((date) => shiftLocalDate(date, 1))}
            style={[styles.dayButton, { borderColor: theme.border }]}>
            <Text style={[styles.dayButtonText, { color: theme.accent }]}>Next</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Macros</Text>
            <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>Consumed</Text>
          </View>
          <View
            style={[
              styles.card,
              styles.macrosCard,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <MacroRow name="Protein" value={totals.proteinG} color="#4F8B62" theme={theme} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <MacroRow name="Carbohydrates" value={totals.carbohydrateG} color="#C48A42" theme={theme} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <MacroRow name="Fat" value={totals.fatG} color="#8B78B5" theme={theme} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.foodHeading}>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Food log</Text>
              <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
                {dayItems.length} {dayItems.length === 1 ? 'entry' : 'entries'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || saving || meals.length === 0 }}
              disabled={loading || saving || meals.length === 0}
              onPress={() => {
                clearError();
                setEditingItem(null);
                dispatchFoodEntryFlow('open-entry');
              }}
              style={[styles.addButton, { backgroundColor: theme.accent }]}>
              <Text style={[styles.addButtonText, { color: theme.backgroundElement }]}>+ Add food</Text>
            </Pressable>
          </View>
          {loading ? (
            <View style={[styles.card, styles.emptyCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>Loading your food log...</Text>
            </View>
          ) : dayItems.length === 0 ? (
            <View style={[styles.card, styles.emptyCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View accessible={false} style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
                <View style={[styles.plateIcon, { borderColor: theme.accent }]} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing logged yet</Text>
              <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
                Add a food to start tracking this day.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, styles.logCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {meals.map((meal) => {
                const mealItems = dayItems.filter((item) => item.meal.id === meal.id);
                if (mealItems.length === 0) return null;
                return (
                  <View key={meal.id}>
                    <Text style={[styles.mealHeading, { color: theme.textSecondary }]}>{meal.name}</Text>
                    {mealItems.map((item, index) => (
                      <FoodLogRow
                        key={item.entry.id}
                        item={item}
                        last={index === mealItems.length - 1}
                        onEdit={() => {
                          clearError();
                          setEditingItem(item);
                          dispatchFoodEntryFlow('open-entry');
                        }}
                        onDelete={() => {
                          clearError();
                          setDeleteError(null);
                          setDeletingItem(item);
                        }}
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          )}
          {error && !formVisible && <Text accessibilityRole="alert" style={styles.inlineError}>{error}</Text>}
          {deleteError && <Text accessibilityRole="alert" style={styles.inlineError}>{deleteError}</Text>}
        </View>
      </View>
    </ScrollView>
    {entryModalMounted && <FoodEntryModal
      visible={formVisible}
      selectedDate={formatLocalDate(selectedDate)}
      meals={meals}
      item={editingItem}
      saving={saving}
      error={error}
      onClose={() => {
        dispatchFoodEntryFlow('close');
        setEditingItem(null);
      }}
      onDismiss={() => dispatchFoodEntryFlow('entry-dismissed')}
      onSearch={() => {
        clearError();
        dispatchFoodEntryFlow(Platform.OS === 'ios' ? 'request-search' : 'open-search');
      }}
      onSubmit={(draft) => {
        void saveEntry(draft, editingItem ?? undefined).then((saved) => {
          if (saved) {
            dispatchFoodEntryFlow('close');
            setEditingItem(null);
          }
        });
      }}
    />}
    {searchModalMounted && (
      <FoodSearchModal
        visible={searchVisible}
        selectedDate={formatLocalDate(selectedDate)}
        meals={meals}
        savedFoods={savedFoods}
        saving={saving}
        error={error}
        onDismiss={() => dispatchFoodEntryFlow('search-dismissed')}
        onClose={() => dispatchFoodEntryFlow(
          Platform.OS === 'ios' ? 'request-return-to-entry' : 'return-to-entry',
        )}
        onSave={(selection: FoodSearchSelection, amount, mealId) => {
          const saveRequest = selection.kind === 'provider'
            ? saveProviderFood(selection.details, amount, mealId)
            : logSavedFood(selection.food, amount, mealId);
          void saveRequest.then((saved) => {
            if (saved) {
              dispatchFoodEntryFlow('close');
              setEditingItem(null);
            }
          });
        }}
      />
    )}
    <Modal
      animationType="fade"
      transparent
      visible={deletingItem !== null}
      onRequestClose={() => setDeletingItem(null)}>
      <View style={styles.confirmBackdrop}>
        <View style={[styles.confirmCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.confirmTitle, { color: theme.text }]}>Delete food entry?</Text>
          <Text style={[styles.confirmMessage, { color: theme.textSecondary }]}>
            {deletingItem?.food.name} will be removed from this day. This cannot be undone.
          </Text>
          {(deleteError || error) && (
            <Text accessibilityRole="alert" style={styles.inlineError}>
              {deleteError ?? error}
            </Text>
          )}
          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setDeletingItem(null)}
              style={[styles.confirmButton, { borderColor: theme.border }]}>
              <Text style={[styles.dayButtonText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                if (!deletingItem) return;
                void deleteEntry(deletingItem).then((deleted) => {
                  if (deleted) setDeletingItem(null);
                  else setDeleteError('The food entry could not be deleted.');
                });
              }}
              style={[styles.confirmButton, { backgroundColor: '#B42318' }]}>
              <Text style={[styles.dayButtonText, { color: '#FFFFFF' }]}>
                {saving ? 'Deleting...' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

type DashboardTheme = ReturnType<typeof useTheme>;

function BalanceValue({
  label,
  value,
  color,
  secondary,
}: {
  label: string;
  value: string;
  color: string;
  secondary: string;
}) {
  return (
    <View style={styles.balanceValue}>
      <Text style={[styles.valueLabel, { color: secondary }]}>{label}</Text>
      <Text style={[styles.balanceText, { color }]}>{value}</Text>
    </View>
  );
}

function MacroRow({
  name,
  value,
  color,
  theme,
}: {
  name: string;
  value: number | null;
  color: string;
  theme: DashboardTheme;
}) {
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroName}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={[styles.macroLabel, { color: theme.text }]}>{name}</Text>
      </View>
      <Text style={[styles.macroTarget, { color: theme.textSecondary }]}>
        {formatAmount(value, 1)} {value === null ? '' : 'g'}
      </Text>
    </View>
  );
}

function FoodLogRow({
  item,
  last,
  onEdit,
  onDelete,
}: {
  item: FoodLogItem;
  last: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const nutrition = calculateFoodNutrition(
    item.food,
    item.entry.consumedQuantity,
    item.entry.consumedUnit,
  ).nutrients;
  const formatNutrient = (amount: number | undefined, unit: 'kcal' | 'g') =>
    amount === undefined ? 'Unknown' : `${formatAmount(amount, unit === 'kcal' ? 0 : 1)} ${unit}`;

  return (
    <View
      style={[
        styles.foodRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}>
      <View style={styles.foodDetails}>
        <Text style={[styles.foodName, { color: theme.text }]}>{item.food.name}</Text>
        <Text style={[styles.foodServing, { color: theme.textSecondary }]}>
          {formatAmount(item.entry.consumedQuantity, 2)} {item.entry.consumedUnit}
        </Text>
        <Text style={[styles.foodNutrition, { color: theme.textSecondary }]}>
          {formatNutrient(nutrition.energy?.quantity, 'kcal')} · P{' '}
          {formatNutrient(nutrition.protein?.quantity, 'g')} · C{' '}
          {formatNutrient(nutrition.carbohydrate?.quantity, 'g')} · F{' '}
          {formatNutrient(nutrition.fat?.quantity, 'g')}
        </Text>
      </View>
      <View style={styles.foodActions}>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.rowAction}>
          <Text style={[styles.rowActionText, { color: theme.accent }]}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDelete} style={styles.rowAction}>
          <Text style={[styles.rowActionText, { color: '#B42318' }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatAmount(value: number | null, maximumFractionDigits: number): string {
  return value === null
    ? 'Unknown'
    : new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexGrow: 1,
  },
  dashboard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  dayControls: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dayButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonText: { fontSize: 14, fontWeight: '600' },
  eyebrow: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: {
    fontSize: 22,
    fontWeight: '700',
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  foodHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  addButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
  },
  calorieCard: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  goalBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  goalBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 21,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceDivider: {
    width: 1,
    height: 40,
    marginHorizontal: Spacing.three,
  },
  balanceValue: {
    flex: 1,
    gap: Spacing.one,
  },
  valueLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  balanceText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  macrosCard: {
    paddingHorizontal: Spacing.three,
  },
  macroRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  macroName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  macroDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  macroLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  macroTarget: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  plateIcon: {
    width: 21,
    height: 21,
    borderWidth: 2,
    borderRadius: 11,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  emptyDescription: {
    maxWidth: 280,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  logCard: { paddingHorizontal: Spacing.three },
  mealHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  foodRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  foodDetails: { flex: 1, gap: 2 },
  foodName: { fontSize: 16, fontWeight: '600' },
  foodServing: { fontSize: 13 },
  foodNutrition: { fontSize: 12, lineHeight: 18 },
  foodActions: { alignItems: 'flex-end' },
  rowAction: { minHeight: 36, minWidth: 52, justifyContent: 'center', alignItems: 'center' },
  rowActionText: { fontSize: 13, fontWeight: '600' },
  inlineError: { color: '#B42318', fontSize: 14 },
  confirmBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  confirmCard: { borderRadius: 20, padding: Spacing.four, gap: Spacing.two },
  confirmTitle: { fontSize: 20, fontWeight: '700' },
  confirmMessage: { fontSize: 15, lineHeight: 22 },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  confirmButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
