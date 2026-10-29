import { useCallback, useEffect, useRef, useState } from 'react';

import type { FoodLogItem, ManualFoodDraft } from '@/domain/food-log';
import { createManualFoodRecord, getLocalDateString } from '@/domain/food-log';
import type { Food, Meal } from '@/domain/models';
import { getDatabase } from '@/data/database';
import { createRepositories } from '@/data/repositories';
import { calculateFoodNutrition } from '@/domain/nutrition';
import { calculateProviderFoodNutrition } from '@/services/usda-food-data-central';
import type { NutritionFoodDetails } from '@/services/usda-food-data-central';

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useFoodLog() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [items, setItems] = useState<FoodLogItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [savedFoods, setSavedFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    async function loadDay() {
      setLoading(true);
      setItems([]);
      setError(null);
      try {
        const database = await getDatabase();
        const repositories = createRepositories(database);
        const [dayItems, availableMeals, foods] = await Promise.all([
          repositories.foodLogEntries.listForDate(selectedDate),
          repositories.meals.ensureDefaults(),
          repositories.foods.list(),
        ]);
        if (active && currentRequest === requestId.current) {
          setItems(dayItems);
          setMeals(availableMeals);
          setSavedFoods(foods);
          setLoading(false);
        }
      } catch (loadError) {
        if (active && currentRequest === requestId.current) {
          setItems([]);
          setMeals([]);
          setSavedFoods([]);
          setLoading(false);
          setError(
            loadError instanceof Error ? loadError.message : 'The food log could not be loaded.',
          );
        }
      }
    }

    void loadDay();
    return () => {
      active = false;
    };
  }, [refreshKey, selectedDate]);

  const saveEntry = useCallback(
    async (draft: ManualFoodDraft, existing?: FoodLogItem): Promise<boolean> => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const now = new Date().toISOString();
        const foodId = existing?.food.id ?? createId('food');
        const entryId = existing?.entry.id ?? createId('entry');
        const created = createManualFoodRecord(draft, selectedDate, now, foodId, entryId);
        const food = existing
          ? { ...created.food, createdAt: existing.food.createdAt }
          : created.food;
        const entry = existing
          ? {
              ...created.entry,
              createdAt: existing.entry.createdAt,
              loggedAt: existing.entry.loggedAt,
            }
          : created.entry;
        const database = await getDatabase();
        const repository = createRepositories(database).foodLogEntries;
        if (existing) {
          await repository.updateFoodLogEntry(food, entry);
        } else {
          await repository.logFood(food, entry);
        }
        setRefreshKey((key) => key + 1);
        return true;
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : 'The food entry could not be saved.',
        );
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [selectedDate],
  );

  const saveProviderFood = useCallback(
    async (
      details: NutritionFoodDetails,
      consumedQuantity: number,
      mealId: string,
    ): Promise<boolean> => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
          throw new TypeError('Amount eaten must be a positive number.');
        }
        if (!mealId.trim()) throw new TypeError('Choose a meal.');
        calculateProviderFoodNutrition(details, consumedQuantity);

        const now = new Date().toISOString();
        const foodId = createId('food');
        const food = {
          ...details.food,
          id: foodId,
          createdAt: now,
          updatedAt: now,
        };
        const entry = {
          id: createId('entry'),
          foodId,
          mealId,
          loggedDate: selectedDate,
          consumedQuantity,
          consumedUnit: details.nutritionBasisUnit,
          loggedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        const database = await getDatabase();
        await createRepositories(database).foodLogEntries.logFood(food, entry);
        setRefreshKey((key) => key + 1);
        return true;
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : 'The USDA food could not be saved.',
        );
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [selectedDate],
  );

  const logSavedFood = useCallback(
    async (food: Food, consumedQuantity: number, mealId: string): Promise<boolean> => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        if (!Number.isFinite(consumedQuantity) || consumedQuantity <= 0) {
          throw new TypeError('Amount eaten must be a positive number.');
        }
        if (!mealId.trim()) throw new TypeError('Choose a meal.');
        calculateFoodNutrition(food, consumedQuantity, food.nutritionBasis.unit);

        const now = new Date().toISOString();
        const foodId = createId('food');
        // Keep later edits scoped to this entry instead of mutating the saved-food version.
        const foodSnapshot = {
          ...food,
          id: foodId,
          createdAt: now,
          updatedAt: now,
        };
        const entry = {
          id: createId('entry'),
          foodId,
          mealId,
          loggedDate: selectedDate,
          consumedQuantity,
          consumedUnit: food.nutritionBasis.unit,
          loggedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        const database = await getDatabase();
        await createRepositories(database).foodLogEntries.logFood(foodSnapshot, entry);
        setRefreshKey((key) => key + 1);
        return true;
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : 'The saved food could not be logged.',
        );
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [selectedDate],
  );

  const deleteEntry = useCallback(async (item: FoodLogItem): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const database = await getDatabase();
      await createRepositories(database).foodLogEntries.deleteWithFood(item.entry.id);
      setRefreshKey((key) => key + 1);
      return true;
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'The food entry could not be deleted.',
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  return {
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
    clearError: () => setError(null),
  };
}
