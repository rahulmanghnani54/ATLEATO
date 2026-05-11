import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { searchFood, type FoodItem } from '@/lib/api/openFoodFacts';

export function useFoodSearch(query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return useQuery({
    queryKey: ['food-search', debouncedQuery],
    queryFn: () => searchFood(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 min — food data doesn't change often
    placeholderData: (prev) => prev,
  });
}
