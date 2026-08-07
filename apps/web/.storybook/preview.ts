import type { Preview } from "@storybook/react";
import { createElement } from "react";
import "../app/globals.css";

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
      return createElement(Story);
    },
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
} satisfies Preview;

export default preview;
