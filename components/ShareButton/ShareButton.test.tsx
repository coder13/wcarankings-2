import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareButton, shareListUrl, shouldShowListShare } from "./ShareButton";

const exactUrl =
  "https://wcarankings.com/lists/favorites?eventId=333&result=average&region=US&page=4";

test("shares the exact current list URL and query string", async () => {
  let sharedData: { title?: string; url?: string } | undefined;

  const result = await shareListUrl({
    url: exactUrl,
    title: "Favorite cubers",
    share: async (data) => {
      sharedData = data;
    },
  });

  assert.equal(result, "shared");
  assert.deepEqual(sharedData, {
    title: "Favorite cubers",
    url: exactUrl,
  });
});

test("copies the exact URL when native sharing is unavailable", async () => {
  let copiedUrl = "";

  const result = await shareListUrl({
    url: exactUrl,
    title: "Favorite cubers",
    writeText: async (url) => {
      copiedUrl = url;
    },
  });

  assert.equal(result, "copied");
  assert.equal(copiedUrl, exactUrl);
});

test("falls back to the clipboard when native sharing fails", async () => {
  let copiedUrl = "";

  const result = await shareListUrl({
    url: exactUrl,
    title: "Favorite cubers",
    share: async () => {
      throw new Error("Native share unavailable");
    },
    writeText: async (url) => {
      copiedUrl = url;
    },
  });

  assert.equal(result, "copied");
  assert.equal(copiedUrl, exactUrl);
});

test("does not copy after the user cancels native sharing", async () => {
  let copied = false;

  const result = await shareListUrl({
    url: exactUrl,
    title: "Favorite cubers",
    share: async () => {
      const error = new Error("Share cancelled");
      error.name = "AbortError";
      throw error;
    },
    writeText: async () => {
      copied = true;
    },
  });

  assert.equal(result, "cancelled");
  assert.equal(copied, false);
});

test("only exposes list sharing outside the search experience", () => {
  assert.equal(
    shouldShowListShare({
      hasList: true,
      searchOpen: false,
      searchQuery: "",
      regexSearch: false,
    }),
    true,
  );
  assert.equal(
    shouldShowListShare({
      hasList: false,
      searchOpen: false,
      searchQuery: "",
      regexSearch: false,
    }),
    false,
  );
  assert.equal(
    shouldShowListShare({
      hasList: true,
      searchOpen: true,
      searchQuery: "",
      regexSearch: false,
    }),
    false,
  );
  assert.equal(
    shouldShowListShare({
      hasList: true,
      searchOpen: false,
      searchQuery: "Max Park",
      regexSearch: false,
    }),
    false,
  );
  assert.equal(
    shouldShowListShare({
      hasList: true,
      searchOpen: false,
      searchQuery: "MAX.*",
      regexSearch: true,
    }),
    false,
  );
});

test("renders an accessible share action and status region", () => {
  const markup = renderToStaticMarkup(<ShareButton title="Favorite cubers" />);

  assert.match(markup, /aria-label="Share this list"/);
  assert.match(markup, /title="Share this list"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
});
