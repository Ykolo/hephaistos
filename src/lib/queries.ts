"use client";

import { useQuery } from "@tanstack/react-query";
import { products, getProduct, type Product } from "@/lib/products";

/**
 * Front-end only: the "API" is the local product catalogue resolved through a
 * tiny async shim so TanStack Query owns caching/loading state today and the
 * call sites don't change the day a real backend lands.
 */
function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function fetchProducts(): Promise<Product[]> {
  return delay(products);
}

async function fetchProduct(id: string): Promise<Product | null> {
  return delay(getProduct(id) ?? null);
}

export const productKeys = {
  all: ["products"] as const,
  detail: (id: string) => ["products", id] as const,
};

export function useProducts() {
  return useQuery({
    queryKey: productKeys.all,
    queryFn: fetchProducts,
    initialData: products,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => fetchProduct(id),
    initialData: getProduct(id) ?? null,
  });
}
