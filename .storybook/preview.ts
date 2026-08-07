import type { Preview } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import "../app/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const preview = {
  globalTypes: {
    theme: {
      description: "Application color theme",
      defaultValue: "light",
      toolbar: {
        icon: "mirror",
        items: [
          { value: "light", title: "Light mode" },
          { value: "dark", title: "Dark mode" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Story),
      );
    },
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/",
        query: {},
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
} satisfies Preview;

export default preview;
