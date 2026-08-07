"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/sw.js?v=7";
const SKIP_WAITING_MESSAGE = "SKIP_WAITING";
const DEVELOPMENT_RELOAD_KEY = "wca-rankings-development-sw-reset";

export function usePwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (!import.meta.env.PROD) {
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations.map((registration) => registration.unregister()),
            ),
          ),
        "caches" in window
          ? caches
              .keys()
              .then((keys) =>
                Promise.all(
                  keys
                    .filter((key) => key.startsWith("wca-rankings-"))
                    .map((key) => caches.delete(key)),
                ),
              )
          : Promise.resolve([]),
      ]).then(() => {
        if (
          navigator.serviceWorker.controller &&
          sessionStorage.getItem(DEVELOPMENT_RELOAD_KEY) !== "1"
        ) {
          sessionStorage.setItem(DEVELOPMENT_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
        sessionStorage.removeItem(DEVELOPMENT_RELOAD_KEY);
      });
      return;
    }

    const abortController = new AbortController();
    const watchedWorkers = new WeakSet<ServiceWorker>();
    let registration: ServiceWorkerRegistration | null = null;
    let reloadOnControllerChange = false;

    const activateUpdate = (worker: ServiceWorker | null) => {
      if (!worker || !navigator.serviceWorker.controller) return;
      reloadOnControllerChange = true;
      worker.postMessage({ type: SKIP_WAITING_MESSAGE });
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker || watchedWorkers.has(worker)) return;
      watchedWorkers.add(worker);

      const onStateChange = () => {
        if (worker.state === "installed") {
          activateUpdate(registration?.waiting ?? worker);
        }
      };

      worker.addEventListener("statechange", onStateChange, {
        signal: abortController.signal,
      });
      onStateChange();
    };

    const onControllerChange = () => {
      if (reloadOnControllerChange) window.location.reload();
    };
    const onUpdateFound = () => {
      watchInstallingWorker(registration?.installing ?? null);
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        void registration?.update().catch(() => undefined);
      }
    };
    const listenerOptions = { signal: abortController.signal };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
      listenerOptions,
    );
    document.addEventListener(
      "visibilitychange",
      checkForUpdate,
      listenerOptions,
    );

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, {
        scope: "/",
        updateViaCache: "none",
      })
      .then((nextRegistration) => {
        if (abortController.signal.aborted) return;
        registration = nextRegistration;
        registration.addEventListener(
          "updatefound",
          onUpdateFound,
          listenerOptions,
        );
        activateUpdate(registration.waiting);
        watchInstallingWorker(registration.installing);
      })
      .catch(() => undefined);

    return () => abortController.abort();
  }, []);
}
