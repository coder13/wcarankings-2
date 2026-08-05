import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export function renderWithProviders(
  children: ReactNode,
  pathname = "/",
  searchParams = new URLSearchParams(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <PathnameContext.Provider value={pathname}>
          <SearchParamsContext.Provider value={searchParams}>
            <AppRouterContext.Provider
              value={{
                back() {},
                forward() {},
                refresh() {},
                push() {},
                replace() {},
                prefetch() {},
              }}
            >
              {children}
            </AppRouterContext.Provider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </QueryClientProvider>,
    );
  } finally {
    queryClient.clear();
  }
}
