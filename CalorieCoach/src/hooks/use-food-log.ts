import { useCallback, useEffect, useRef, useState } from 'react';

import type { FoodLogItem, ManualFoodDraft } from '@/domain/food-log';
import { createManualFoodRecord, getLocalDateString } from '@/domain/food-log';
import type { Meal } from '@/domain/models';
import { getDatabase } from '@/data/database';
import { createRepositories } from '@/data/repositories';

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useFoodLog() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [items, setItems] = useState<FoodLogItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
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
        const [dayItems, availableMeals] = await Promise.all([
          repositories.foodLogEntries.listForDate(selectedDate),
          repositories.meals.ensureDefaults(),
        ]);
        if (active && currentRequest === requestId.current) {
          setItems(dayItems);
          setMeals(availableMeals);
          setLoading(false);
        }
      } catch (loadError) {
        if (active && currentRequest === requestId.current) {
          setItems([]);
          setMeals([]);
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
    loading,
    saving,
    error,
    saveEntry,
    deleteEntry,
    clearError: () => setError(null),
  };
}
