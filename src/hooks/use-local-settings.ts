import { useCallback, useEffect, useState } from 'react';

import type { AppSettings, WeightUnit } from '@/domain/models';
import { getDatabase } from '@/data/database';
import { createRepositories } from '@/data/repositories';

interface LocalSettingsState {
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export function useLocalSettings() {
  const [state, setState] = useState<LocalSettingsState>({
    settings: null,
    loading: true,
    saving: false,
    error: null,
  });

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const database = await getDatabase();
        const settings = await createRepositories(database).settings.getOrCreate();
        if (active) setState({ settings, loading: false, saving: false, error: null });
      } catch (error) {
        if (active) {
          setState({
            settings: null,
            loading: false,
            saving: false,
            error: error instanceof Error ? error.message : 'Local settings could not be loaded.',
          });
        }
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  const saveWeightUnit = useCallback(async (unit: WeightUnit) => {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const database = await getDatabase();
      const settings = await createRepositories(database).settings.updateWeightUnit(unit);
      setState({ settings, loading: false, saving: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : 'Local settings could not be saved.',
      }));
    }
  }, []);

  return { ...state, saveWeightUnit };
}
