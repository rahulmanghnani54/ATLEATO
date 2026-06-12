import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { searchFood, type FoodItem } from '@/lib/api/openFoodFacts';

export function useFoodSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    // 200ms feels nearly instant while still batching keystrokes
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  return useQuery({
    queryKey: ['food-search', debouncedQuery],
    queryFn: () => searchFood(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 min — food data doesn't change often
    gcTime: 30 * 60 * 1000,    // keep recent searches warm in cache for 30 min
    placeholderData: (prev) => prev, // show old results while new ones load
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
