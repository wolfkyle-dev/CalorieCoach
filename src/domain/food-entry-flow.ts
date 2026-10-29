export type FoodEntryFlowState =
  | 'closed'
  | 'entry'
  | 'dismissing-entry-for-search'
  | 'search'
  | 'dismissing-search-for-entry';

export type FoodEntryFlowAction =
  | 'open-entry'
  | 'open-search'
  | 'request-search'
  | 'entry-dismissed'
  | 'request-return-to-entry'
  | 'search-dismissed'
  | 'return-to-entry'
  | 'close';

export function transitionFoodEntryFlow(
  state: FoodEntryFlowState,
  action: FoodEntryFlowAction,
): FoodEntryFlowState {
  switch (action) {
    case 'open-entry':
      return 'entry';
    case 'open-search':
      return 'search';
    case 'request-search':
      return state === 'entry' ? 'dismissing-entry-for-search' : state;
    case 'entry-dismissed':
      return state === 'dismissing-entry-for-search' ? 'search' : state;
    case 'request-return-to-entry':
      return state === 'search' ? 'dismissing-search-for-entry' : state;
    case 'search-dismissed':
      return state === 'dismissing-search-for-entry' ? 'entry' : state;
    case 'return-to-entry':
      return state === 'search' ? 'entry' : state;
    case 'close':
      return 'closed';
  }
}
